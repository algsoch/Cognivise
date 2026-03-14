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

// ── Browser TTS fallback (fires when Gemini WebRTC is unavailable) ──────────
// Uses Web Speech API to speak agent_speech immediately so there's no lag.
// Gemini's own WebRTC audio replaces this when connected.
let _ttsUtterance    = null
let _ttsGeminiActive = false  // set true when Stream call audio arrives
let _aiTimerStart    = 0      // set when learner_message sent; cleared on agent_speech

function browserSpeak(text) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return
  if (_ttsGeminiActive) return  // Gemini WebRTC is speaking — don't double up
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/Algsoch/g, 'Alagsoch'))
  u.rate  = 1.05
  u.pitch = 1.0
  // Prefer a natural-sounding voice if available
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v =>
    /Google US English|Samantha|Karen|Moira|en-US/i.test(v.name)
  )
  if (preferred) u.voice = preferred
  _ttsUtterance = u
  window.speechSynthesis.speak(u)
}

// Called by useStreamAudio when agent WebRTC audio starts playing
export function setGeminiAudioActive(active) {
  _ttsGeminiActive = active
  if (active) window.speechSynthesis?.cancel()
}

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
  if (raw.restlessness        !== undefined) {
    patch.restlessness        = raw.restlessness
    patch.backgroundMovement  = raw.restlessness   // alias for display
  }
  if (raw.background_movement !== undefined) patch.backgroundMovement = raw.background_movement
  if (raw.head_pose_confidence !== undefined) patch.headPoseConfidence = raw.head_pose_confidence
  // Some processor versions emit yaw/pitch — derive confidence from those
  if (raw.head_yaw !== undefined && raw.head_pitch !== undefined) {
    patch.headYaw   = raw.head_yaw
    patch.headPitch = raw.head_pitch
    patch.headPoseConfidence = Math.max(0, 1 - (Math.abs(raw.head_yaw) + Math.abs(raw.head_pitch)) / 90)
    // Derive gaze direction from head angles (overridden below if backend sends it)
    const yaw = raw.head_yaw, pitch = raw.head_pitch
    if (Math.abs(yaw) < 8 && Math.abs(pitch) < 8) patch.gazeDirection = 'center'
    else if (yaw > 12)  patch.gazeDirection = 'right'
    else if (yaw < -12) patch.gazeDirection = 'left'
    else if (pitch < -10) patch.gazeDirection = 'up'
    else if (pitch >  10) patch.gazeDirection = 'down'
    else patch.gazeDirection = 'center'
  }
  if (raw.focus_duration      !== undefined) patch.focusDuration      = raw.focus_duration
  if (raw.distraction_count   !== undefined) patch.distractionCount   = raw.distraction_count
  if (raw.confusion_indicators !== undefined) patch.confusionIndicators = raw.confusion_indicators
  if (raw.recent_mistakes     !== undefined) patch.recentMistakes     = raw.recent_mistakes
  // Eye tracking
  if (raw.eye_ar              !== undefined) patch.eyeAR              = raw.eye_ar
  if (raw.fixation_duration   !== undefined) patch.fixationDuration   = raw.fixation_duration
  if (raw.eye_closure_duration !== undefined) patch.eyeClosureDuration = raw.eye_closure_duration
  if (raw.people_count        !== undefined) patch.peopleCount        = raw.people_count
  if (raw.gaze_direction      !== undefined) patch.gazeDirection      = raw.gaze_direction
  if (raw.frame_hash          !== undefined) patch.frameHash          = raw.frame_hash
  if (raw.mouth_open_ratio    !== undefined) patch.mouthOpenRatio     = raw.mouth_open_ratio
  if (raw.mouth_movement      !== undefined) patch.mouthMovement      = raw.mouth_movement
  if (raw.speaking_detected   !== undefined) patch.speakingDetected   = raw.speaking_detected
  if (raw.tongue_score        !== undefined) patch.tongueScore        = raw.tongue_score
  if (raw.tongue_visible      !== undefined) patch.tongueVisible      = raw.tongue_visible
  // Latency tracking (milliseconds) — only overwrite if backend sends a real measurement (> 0)
  if (raw.user_response_ms > 0) patch.userResponseMs = raw.user_response_ms
  if (raw.ai_response_ms   > 0) patch.aiResponseMs   = raw.ai_response_ms

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
  const setSignalFreshness     = useSessionStore((s) => s.setSignalFreshness)
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
        setSendMessage((text) => {
          ws.send(JSON.stringify({ learner_message: text }))
          _aiTimerStart = Date.now()
        })
        setSendRaw((obj) => {
          ws.send(JSON.stringify(obj))
          // Track AI response time for any message that contains learner text
          if (obj && obj.learner_message) _aiTimerStart = Date.now()
        })
      }

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return
        try {
          const raw = JSON.parse(evt.data)
          const normalizedRaw = { ...raw }

          // When the frame analyzer emits a transient no-face result, avoid
          // clobbering a fresh browser overlay face signal.
          if (normalizedRaw.frame_hash !== undefined && normalizedRaw.face_detected === false) {
            const now = Date.now()
            const state = useSessionStore.getState()
            const overlayFresh = state.signalFreshness.faceSignalAt && (now - state.signalFreshness.faceSignalAt) < 1600
            if (overlayFresh && state.metrics.faceDetected) {
              normalizedRaw.face_detected = true
            }
          }

          // Push metric patch to store
          const patch = mapMetrics(normalizedRaw)
          if (Object.keys(patch).length > 0) updateMetrics(patch)

          // Browser overlay face metrics arrive without frame_hash; track their freshness.
          if (
            normalizedRaw.frame_hash === undefined &&
            (normalizedRaw.mouth_open_ratio !== undefined ||
             normalizedRaw.speaking_detected !== undefined ||
             normalizedRaw.tongue_score !== undefined ||
             normalizedRaw.face_detected !== undefined)
          ) {
            setSignalFreshness('faceSignalAt')
          }

          // Store Stream call info when backend sends it
          if (normalizedRaw.call_id) setStreamCall(normalizedRaw.call_id, normalizedRaw.call_type ?? 'default')

          // Sync backend screen-detected topic to the UI
          // Auto-initialize mastery entry so topic shows in tracker immediately
          if (normalizedRaw.current_topic) {
            setTopic(normalizedRaw.current_topic)
            const currentMastery = useSessionStore.getState().mastery
            if (!(normalizedRaw.current_topic in currentMastery)) {
              updateMastery(normalizedRaw.current_topic, 0)
            }
          }

          // Agent speech: display text + fire browser TTS immediately as fallback
          // (Gemini WebRTC audio is preferred when connected — setGeminiAudioActive suppresses TTS)
          if (normalizedRaw.agent_speech) {
            // Measure how long AI took to respond (from learner message to AI reply)
            if (_aiTimerStart > 0) {
              const aiMs = Date.now() - _aiTimerStart
              _aiTimerStart = 0
              updateMetrics({ aiResponseMs: aiMs })
            }
            setAgentSpeech(normalizedRaw.agent_speech)
            setSignalFreshness('agentSpeechAt')
            browserSpeak(normalizedRaw.agent_speech)  // instant TTS — no Gemini lag
            // Log to conversation history (deduped below)
            addConversationEntry('ai', normalizedRaw.agent_speech, normalizedRaw.agent_action ?? null)
          }

          // Agent transcript: Gemini's actual spoken text. Mirror it into agentSpeech
          // when no explicit agent_speech event is present so UI reflects real output.
          if (normalizedRaw.agent_transcript) {
            setAgentTranscript(normalizedRaw.agent_transcript)
            if (!normalizedRaw.agent_speech) {
              setAgentSpeech(normalizedRaw.agent_transcript)
              setSignalFreshness('agentSpeechAt')
            }
          }

          // Agent action: what type of intervention just fired (for activity panel)
          if (normalizedRaw.agent_action) {
            setAgentAction({ type: normalizedRaw.agent_action, topic: normalizedRaw.agent_action_topic ?? null, timestamp: Date.now() })
          }

          // Learner speech: what the user just said (for activity panel "You said" section)
          if (normalizedRaw.learner_speech) {
            setLearnerSpeech(normalizedRaw.learner_speech)
            setSignalFreshness('learnerSpeechAt')
            // Log to conversation history
            addConversationEntry('user', normalizedRaw.learner_speech)
          }

          if (normalizedRaw.frame_hash !== undefined) {
            setSignalFreshness('frameAt')
          }

          // Mastery updates: { mastery: { "Python": 62.5 } }
          if (normalizedRaw.mastery && typeof normalizedRaw.mastery === 'object') {
            Object.entries(normalizedRaw.mastery).forEach(([t, s]) => updateMastery(t, s))
          }

          // topic_mastery_init: backend sends initial mastery score when topic first detected
          if (normalizedRaw.topic_mastery_init && typeof normalizedRaw.topic_mastery_init === 'object') {
            Object.entries(normalizedRaw.topic_mastery_init).forEach(([t, s]) => {
              const currentMastery = useSessionStore.getState().mastery
              if (!(t in currentMastery)) updateMastery(t, s)
            })
          }

          // Fire intervention when a new one arrives (type changes)
          // Skip null / "none" — those are non-events
          if (
            normalizedRaw.intervention_type &&
            normalizedRaw.intervention_type !== 'none' &&
            normalizedRaw.intervention_type !== 'NONE' &&
            normalizedRaw.intervention_type !== lastInterventionRef.current
          ) {
            lastInterventionRef.current = normalizedRaw.intervention_type
            addIntervention({
              type: normalizedRaw.intervention_type,
              message: normalizedRaw.intervention_message ?? `Adaptive: ${normalizedRaw.intervention_type.replace(/_/g, ' ')}`,
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
