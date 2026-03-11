/**
 * useBackendConnection — connects to the FastAPI WebSocket server on port 8001.
 *
 * On each message it maps snake_case backend keys → camelCase store keys,
 * calls updateMetrics() for metric patches, and addIntervention() when an
 * intervention fires.  Automatically reconnects every 3 s if the socket
 * closes or errors.
 */

import { useEffect, useRef } from 'react'
import { useSessionStore } from './useSessionStore'

const WS_URL = 'ws://localhost:8001/ws/metrics'
const RECONNECT_DELAY = 3000

/** Maps a raw backend snapshot → camelCase metric patch */
function mapMetrics(raw) {
  const patch = {}

  if (raw.engagement_score    !== undefined) patch.engagementScore    = raw.engagement_score
  if (raw.attention_score     !== undefined) patch.attentionScore     = raw.attention_score
  if (raw.cognitive_load_score !== undefined) patch.cognitiveLoadScore = raw.cognitive_load_score
  if (raw.performance_score   !== undefined) patch.performanceScore   = raw.performance_score
  if (raw.learner_state       !== undefined) patch.learnerState       = raw.learner_state
  if (raw.face_detected       !== undefined) patch.faceDetected       = raw.face_detected
  if (raw.gaze_on_screen      !== undefined) patch.gazeOnScreen       = raw.gaze_on_screen
  if (raw.blink_rate          !== undefined) patch.blinkRate          = raw.blink_rate
  if (raw.restlessness        !== undefined) patch.restlessness       = raw.restlessness
  if (raw.head_pose_confidence !== undefined) patch.headPoseConfidence = raw.head_pose_confidence
  // Some processor versions emit yaw/pitch — derive confidence from those
  if (raw.head_yaw !== undefined && raw.head_pitch !== undefined) {
    patch.headYaw   = raw.head_yaw
    patch.headPitch = raw.head_pitch
    // confidence = 1 when looking straight, 0 when extreme angle
    patch.headPoseConfidence = Math.max(0, 1 - (Math.abs(raw.head_yaw) + Math.abs(raw.head_pitch)) / 90)
  }
  if (raw.focus_duration      !== undefined) patch.focusDuration      = raw.focus_duration
  if (raw.distraction_count   !== undefined) patch.distractionCount   = raw.distraction_count
  if (raw.confusion_indicators !== undefined) patch.confusionIndicators = raw.confusion_indicators
  if (raw.recent_mistakes     !== undefined) patch.recentMistakes     = raw.recent_mistakes

  return patch
}

export function useBackendConnection() {
  const updateMetrics   = useSessionStore((s) => s.updateMetrics)
  const addIntervention = useSessionStore((s) => s.addIntervention)
  const setAgentStatus  = useSessionStore((s) => s.setAgentStatus)
  const setStreamCall   = useSessionStore((s) => s.setStreamCall)
  const updateMastery          = useSessionStore((s) => s.updateMastery)
  const setTopic               = useSessionStore((s) => s.setTopic)
  const setAgentSpeech         = useSessionStore((s) => s.setAgentSpeech)
  const setAgentTranscript     = useSessionStore((s) => s.setAgentTranscript)
  const setAgentAction         = useSessionStore((s) => s.setAgentAction)
  const setLearnerSpeech       = useSessionStore((s) => s.setLearnerSpeech)
  const addConversationEntry   = useSessionStore((s) => s.addConversationEntry)
  const setSendMessage         = useSessionStore((s) => s.setSendMessage)
  const setSendRaw             = useSessionStore((s) => s.setSendRaw)

  const wsRef       = useRef(null)
  const timerRef    = useRef(null)
  const mountedRef  = useRef(true)
  // Track last intervention_type to avoid re-firing on every tick
  const lastInterventionRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true

    function connect() {
      if (!mountedRef.current) return

      setAgentStatus('connecting')

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        setAgentStatus('connected')
        setSendMessage((text) => ws.send(JSON.stringify({ learner_message: text })))
        setSendRaw((obj) => ws.send(JSON.stringify(obj)))
      }

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return
        try {
          const raw = JSON.parse(evt.data)

          // Push metric patch to store
          const patch = mapMetrics(raw)
          if (Object.keys(patch).length > 0) updateMetrics(patch)

          // Store Stream call info when backend sends it
          if (raw.call_id) setStreamCall(raw.call_id, raw.call_type ?? 'default')

          // Sync backend screen-detected topic to the UI
          // Auto-initialize mastery entry so topic shows in tracker immediately
          if (raw.current_topic) {
            setTopic(raw.current_topic)
            const currentMastery = useSessionStore.getState().mastery
            if (!(raw.current_topic in currentMastery)) {
              updateMastery(raw.current_topic, 0)
            }
          }

          // Agent speech: Gemini Realtime WebRTC handles audio — we only display the text.
          // DO NOT call window.speechSynthesis here — that caused double-audio echo
          // because Gemini was already speaking via the WebRTC audio track in useStreamAudio.
          if (raw.agent_speech) {
            setAgentSpeech(raw.agent_speech)
            // Log to conversation history (deduped below)
            addConversationEntry('ai', raw.agent_speech, raw.agent_action ?? null)
          }

          // Agent transcript: Gemini's actual spoken text (for display, no TTS to avoid duplicate)
          if (raw.agent_transcript) setAgentTranscript(raw.agent_transcript)

          // Agent action: what type of intervention just fired (for activity panel)
          if (raw.agent_action) {
            setAgentAction({ type: raw.agent_action, topic: raw.agent_action_topic ?? null, timestamp: Date.now() })
          }

          // Learner speech: what the user just said (for activity panel "You said" section)
          if (raw.learner_speech) {
            setLearnerSpeech(raw.learner_speech)
            // Log to conversation history
            addConversationEntry('user', raw.learner_speech)
          }

          // Mastery updates: { mastery: { "Python": 62.5 } }
          if (raw.mastery && typeof raw.mastery === 'object') {
            Object.entries(raw.mastery).forEach(([t, s]) => updateMastery(t, s))
          }

          // topic_mastery_init: backend sends initial mastery score when topic first detected
          if (raw.topic_mastery_init && typeof raw.topic_mastery_init === 'object') {
            Object.entries(raw.topic_mastery_init).forEach(([t, s]) => {
              const currentMastery = useSessionStore.getState().mastery
              if (!(t in currentMastery)) updateMastery(t, s)
            })
          }

          // Fire intervention when a new one arrives (type changes)
          // Skip null / "none" — those are non-events
          if (
            raw.intervention_type &&
            raw.intervention_type !== 'none' &&
            raw.intervention_type !== 'NONE' &&
            raw.intervention_type !== lastInterventionRef.current
          ) {
            lastInterventionRef.current = raw.intervention_type
            addIntervention({
              type: raw.intervention_type,
              message: raw.intervention_message ?? `Adaptive: ${raw.intervention_type.replace(/_/g, ' ')}`,
            })
          }
        } catch {
          // Ignore malformed frames
        }
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setAgentStatus('disconnected')
        setSendMessage(null)
        setSendRaw(null)
        // Schedule reconnect
        timerRef.current = setTimeout(connect, RECONNECT_DELAY)
      }

      ws.onerror = () => {
        ws.close() // triggers onclose → reconnect
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      clearTimeout(timerRef.current)
      wsRef.current?.close()
      setAgentStatus('disconnected')
      setSendMessage(null)
      setSendRaw(null)
    }
  }, []) // run once on mount

  // Expose nothing — side-effect-only hook
}
