/**
 * EnglishCoachPage — AI-powered English communication coach.
 * Listens to user speech, sends text to Groq LLaMA-3, receives
 * detailed feedback on grammar, clarity, and pronunciation hints.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../hooks/useSessionStore'
import { useBackendConnection } from '../hooks/useBackendConnection'
import { useWebcamAnalysis } from '../hooks/useWebcamAnalysis'
import AgentStatusBar from '../components/AgentStatusBar'
import EngagementMeter from '../components/EngagementMeter'
import CognitiveLoadIndicator from '../components/CognitiveLoadIndicator'
import AttentionWaveform from '../components/AttentionWaveform'
import EyeTrackingPanel from '../components/EyeTrackingPanel'
import FaceMonitorOverlay from '../components/FaceMonitorOverlay'
import MonitoringScopeCard from '../components/MonitoringScopeCard'

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8001`

// ── Groq API call ─────────────────────────────────────────────────────────────
async function analyzeWithGroq(transcript, mode = 'analyze', faceMetrics = null, conversationContext = null, speakingStyleContext = null, learnerLevel = 'intermediate') {
  const res = await fetch(`${API_BASE}/api/english-coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      mode,
      level: learnerLevel,
      face_metrics: faceMetrics,
      conversation_context: conversationContext,
      speaking_style_context: speakingStyleContext,
    }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// ── Sentence generator ────────────────────────────────────────────────────────
async function generateSentence(level = 'intermediate') {
  const res = await fetch(`${API_BASE}/api/english-coach/sentence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// ── Highlighted speech renderer ─────────────────────────────────────────────
function HighlightedSpeech({ text }) {
  if (!text) return null

  const parts = []
  let remaining = text
  let key = 0

  // Find and highlight "You can say:"
  const sayIndex = remaining.indexOf('You can say:')
  if (sayIndex !== -1) {
    parts.push(<span key={key++}>{remaining.substring(0, sayIndex)}</span>)
    const afterSay = remaining.substring(sayIndex + 'You can say:'.length)
    const endIndex = afterSay.indexOf('. ')
    const sayText = endIndex !== -1 ? afterSay.substring(0, endIndex + 1) : afterSay
    parts.push(
      <span key={key++} className="bg-yellow-400/30 text-yellow-100 font-medium px-1 rounded border border-yellow-400/50">
        You can say:
      </span>
    )
    parts.push(
      <span key={key++} className="bg-yellow-400/20 text-yellow-100 px-1 rounded">
        {sayText}
      </span>
    )
    remaining = endIndex !== -1 ? afterSay.substring(endIndex + 1) : ''
  }

  // Find and highlight "Follow-up question:"
  const questionIndex = remaining.indexOf('Follow-up question:')
  if (questionIndex !== -1) {
    parts.push(<span key={key++}>{remaining.substring(0, questionIndex)}</span>)
    const afterQuestion = remaining.substring(questionIndex + 'Follow-up question:'.length)
    parts.push(
      <span key={key++} className="bg-green-400/30 text-green-100 font-medium px-1 rounded border border-green-400/50">
        Follow-up question:
      </span>
    )
    parts.push(
      <span key={key++} className="bg-green-400/20 text-green-100 px-1 rounded">
        {afterQuestion}
      </span>
    )
  } else {
    parts.push(<span key={key++}>{remaining}</span>)
  }

  return <span>{parts}</span>
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const color = score >= 85 ? '#22c55e' : score >= 65 ? '#6c63ff' : score >= 45 ? '#f59e0b' : '#ef4444'
  const label = score >= 85 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Fair' : 'Needs Work'
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl"
        style={{ background: color + '22', border: `2px solid ${color}`, color }}
      >
        {score}
      </div>
      <div>
        <div className="font-semibold text-text-primary" style={{ color }}>{label}</div>
        <div className="text-xs text-text-muted">Communication score</div>
      </div>
    </div>
  )
}

// ── Feedback card ─────────────────────────────────────────────────────────────
function FeedbackCard({ result, transcript, coachSpeech }) {
  if (!result) return null
  const {
    score,
    corrections = [],
    grammar_notes = [],
    pronunciation_notes = [],
    delivery_notes = [],
    speaking_style_notes = [],
    focus_feedback,
    action_plan = [],
    overall_feedback,
    improvement_tip,
    expression_observations = [],
    emotion_inference,
    follow_up_relevance_score,
    follow_up_relevance_feedback,
    how_you_should_say_it,
    next_answer_blueprint,
    follow_up_question,
    tone,
    model_used,
  } = result

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface/60 border border-border rounded-2xl p-5 space-y-4"
    >
      {/* Score + tone */}
      <div className="flex items-start justify-between">
        <ScoreBadge score={score ?? 70} />
        {tone && (
          <span className="text-xs px-2 py-1 rounded-full bg-muted/40 text-text-secondary">
            Tone: {tone}
          </span>
        )}
      </div>

      {/* Original transcript */}
      <div>
        <div className="text-xs text-text-muted uppercase tracking-wide mb-1 font-medium">You said</div>
        <p className="text-sm text-text-primary bg-muted/30 rounded-lg px-3 py-2 leading-relaxed italic">
          "{transcript}"
        </p>
      </div>

      {/* Coach audio output */}
      {coachSpeech && (
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-1 font-medium">Coach spoke</div>
          <p className="text-sm text-text-primary bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 leading-relaxed">
            <HighlightedSpeech text={coachSpeech} />
          </p>
        </div>
      )}

      {(typeof follow_up_relevance_score === 'number' || follow_up_relevance_feedback) && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2">
          <div className="text-xs text-cyan-300 font-medium mb-1">🔗 Follow-up Relation</div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Relevance score: <span className="text-text-primary font-mono">{typeof follow_up_relevance_score === 'number' ? follow_up_relevance_score : '--'}/100</span>
          </p>
          {follow_up_relevance_feedback && (
            <p className="text-xs text-text-secondary leading-relaxed mt-1">{follow_up_relevance_feedback}</p>
          )}
        </div>
      )}

      {/* Corrections */}
      {corrections.length > 0 && (
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2 font-medium">⚠️ Words to improve</div>
          <div className="space-y-2">
            {corrections.map((c, i) => (
              <div key={i} className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-amber-400">"{c.word}"</span>
                  <span className="text-xs text-text-muted">→</span>
                  <span className="text-sm text-emerald-400 font-semibold">"{c.suggestion}"</span>
                </div>
                <p className="text-xs text-text-secondary">{c.issue}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grammar notes */}
      {grammar_notes.length > 0 && (
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2 font-medium">📝 Grammar</div>
          <ul className="space-y-1">
            {grammar_notes.map((note, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                <span className="text-pulse mt-0.5 flex-shrink-0">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pronunciation_notes.length > 0 && (
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2 font-medium">🗣 Pronunciation</div>
          <ul className="space-y-1">
            {pronunciation_notes.map((note, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5 flex-shrink-0">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {delivery_notes.length > 0 && (
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2 font-medium">🎯 Delivery</div>
          <ul className="space-y-1">
            {delivery_notes.map((note, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {speaking_style_notes.length > 0 && (
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2 font-medium">🧠 Speaking Style</div>
          <ul className="space-y-1">
            {speaking_style_notes.map((note, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                <span className="text-cyan-300 mt-0.5 flex-shrink-0">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {focus_feedback && (
        <div className="bg-aurora/10 border border-aurora/20 rounded-lg px-3 py-2">
          <div className="text-xs text-aurora font-medium mb-1">👁 Vision & Focus</div>
          <p className="text-xs text-text-secondary leading-relaxed">{focus_feedback}</p>
        </div>
      )}

      {expression_observations.length > 0 && (
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2 font-medium">🙂 Expression & Emotion</div>
          <ul className="space-y-1">
            {expression_observations.map((note, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                <span className="text-cyan-300 mt-0.5 flex-shrink-0">•</span>
                {note}
              </li>
            ))}
          </ul>
          {emotion_inference && (
            <p className="text-xs text-text-secondary mt-2">Likely emotion signal: <span className="text-text-primary">{emotion_inference}</span></p>
          )}
        </div>
      )}

      {/* Overall feedback */}
      {overall_feedback && (
        <div className="bg-pulse/10 border border-pulse/20 rounded-lg px-3 py-2">
          <div className="text-xs text-pulse font-medium mb-1">💡 Overall Feedback</div>
          <p className="text-xs text-text-secondary leading-relaxed">{overall_feedback}</p>
        </div>
      )}

      {/* Improvement tip */}
      {improvement_tip && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <div className="text-xs text-emerald-400 font-medium mb-1">🚀 Today's Tip</div>
          <p className="text-xs text-text-secondary leading-relaxed">{improvement_tip}</p>
        </div>
      )}

      {(how_you_should_say_it || next_answer_blueprint) && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
          <div className="text-xs text-indigo-300 font-medium mb-1">🧩 How You Should Say It</div>
          {how_you_should_say_it && (
            <p className="text-sm text-text-secondary leading-relaxed">
              <span className="bg-yellow-400/30 text-yellow-100 font-medium px-2 py-1 rounded-md border border-yellow-400/50 block sm:inline">
                {how_you_should_say_it}
              </span>
            </p>
          )}
          {next_answer_blueprint && (
            <p className="text-xs text-text-secondary leading-relaxed mt-1">
              <span className="text-text-primary font-medium">Blueprint:</span> {next_answer_blueprint}
            </p>
          )}
        </div>
      )}

      {action_plan.length > 0 && (
        <div className="bg-surface/40 border border-border rounded-lg px-3 py-2">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-1 font-medium">3-Step Action Plan</div>
          <ol className="space-y-1 text-xs text-text-secondary list-decimal ml-4">
            {action_plan.slice(0, 3).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {follow_up_question && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2">
          <div className="text-xs text-cyan-300 font-medium mb-1">❓ Coach Follow-up</div>
          <p className="text-sm text-text-secondary leading-relaxed">
            <span className="bg-green-400/30 text-green-100 font-medium px-2 py-1 rounded-md border border-green-400/50 block sm:inline">
              {follow_up_question}
            </span>
          </p>
        </div>
      )}

      {model_used && (
        <div className="text-[10px] text-text-muted text-right font-mono uppercase">Model: {model_used}</div>
      )}
    </motion.div>
  )
}

// ── History entry ─────────────────────────────────────────────────────────────
function HistoryEntry({ entry }) {
  const c = (entry.result?.score ?? 50) >= 70 ? '#22c55e' : '#f59e0b'
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/40 last:border-0">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
           style={{ background: c + '22', color: c }}>
        {entry.result?.score ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary truncate italic">"{entry.transcript}"</p>
        <p className="text-xs text-text-muted mt-0.5">{entry.result?.overall_feedback?.slice(0, 80)}…</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const LEVELS = ['beginner', 'intermediate', 'advanced']
const MODES  = [
  { id: 'analyze',  label: 'Free Speech',   icon: '🎙',  hint: 'Say anything, get detailed feedback' },
  { id: 'repeat',   label: 'Read & Repeat', icon: '📖',  hint: 'AI gives you a sentence to repeat' },
  { id: 'topic',    label: 'Topic Chat',    icon: '💬',  hint: 'Discuss a topic, AI evaluates your response' },
]

export default function EnglishCoachPage() {
  const navigate = useNavigate()
  const setUser = useSessionStore((s) => s.setUser)
  const startSession = useSessionStore((s) => s.startSession)
  const endSession = useSessionStore((s) => s.endSession)
  const setTopic = useSessionStore((s) => s.setTopic)
  const setContentSource = useSessionStore((s) => s.setContentSource)
  const setLearnerSpeech = useSessionStore((s) => s.setLearnerSpeech)
  const setAgentSpeech = useSessionStore((s) => s.setAgentSpeech)
  const setAgentTranscript = useSessionStore((s) => s.setAgentTranscript)
  const agentStatus = useSessionStore((s) => s.agentStatus)
  const streamCallId = useSessionStore((s) => s.streamCallId)
  const streamCallType = useSessionStore((s) => s.streamCallType)
  const addConversationEntry = useSessionStore((s) => s.addConversationEntry)
  const setSignalFreshness = useSessionStore((s) => s.setSignalFreshness)
  const metrics = useSessionStore((s) => s.metrics)
  const freshness = useSessionStore((s) => s.signalFreshness)
  const learnerSpeechLive = useSessionStore((s) => s.learnerSpeech)
  const agentSpeechLive = useSessionStore((s) => s.agentTranscript || s.agentSpeech)
  const conversationLog = useSessionStore((s) => s.conversationLog)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [visionBootstrapped, setVisionBootstrapped] = useState(false)
  const [visionBootError, setVisionBootError] = useState('')
  const [mode, setMode]         = useState('analyze')
  const [level, setLevel]       = useState('intermediate')
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript]   = useState('')
  const [interimText, setInterimText] = useState('')
  const [result, setResult]           = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [targetSentence, setTargetSentence] = useState('')
  const [history, setHistory]         = useState([]) // local session history
  const [sessionScore, setSessionScore] = useState([])
  const [speakFeedback, setSpeakFeedback] = useState(true)
  const [showInspector, setShowInspector] = useState(false)
  const [inspectorTick, setInspectorTick] = useState(Date.now())
  const [eventLog, setEventLog] = useState([])
  const [readinessOverride, setReadinessOverride] = useState(false)
  const [topicPrompt, setTopicPrompt] = useState('')
  const [visualMode, setVisualMode] = useState('composite') // composite | landmarks | raw
  const [frameHistory, setFrameHistory] = useState([])
  const [frameCursor, setFrameCursor] = useState(0)
  const [lastFeedbackSpeech, setLastFeedbackSpeech] = useState('')
  const [speechVoice, setSpeechVoice] = useState(null)
  const [micEnabled, setMicEnabled] = useState(false)
  const [micStatus, setMicStatus] = useState('idle') // idle | requesting | enabled | denied | error
  const [lastVisionPayload, setLastVisionPayload] = useState(null)
  const [lastTranscriptPayload, setLastTranscriptPayload] = useState(null)
  const [lastGroqResponseSummary, setLastGroqResponseSummary] = useState(null)
  const [followUpThread, setFollowUpThread] = useState([])
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [editableTranscript, setEditableTranscript] = useState('')
  const [lastAudioFeatures, setLastAudioFeatures] = useState(null)
  const [lastRecordedAudioUrl, setLastRecordedAudioUrl] = useState('')
  const [lastRecordedVideoUrl, setLastRecordedVideoUrl] = useState('')
  const [recordArchive, setRecordArchive] = useState([])
  const [showAiCommunication, setShowAiCommunication] = useState(false)
  const [newOutputBadge, setNewOutputBadge] = useState(false)

  const recognitionRef = useRef(null)
  const previewRef = useRef(null)
  const topPreviewRef = useRef(null)
  const bootRef = useRef(false)
  const aiStartedRef = useRef(false)
  const micRetryRef = useRef(0)
  const micStreamRef = useRef(null)
  const lastAutoAnalyzedRef = useRef('')
  const mediaRecorderRef = useRef(null)
  const analysisMediaRecorderRef = useRef(null)
  const recordingChunksRef = useRef([])
  const analysisRecordingChunksRef = useRef([])
  const recordingStartedAtRef = useRef(0)
  const recordingFinalizeRef = useRef(Promise.resolve(null))
  const recordingFinalizeResolveRef = useRef(null)
  const lastAudioFeaturesRef = useRef(null)
  const lastAudioDataUrlRef = useRef('')
  const lastVideoDataUrlRef = useRef('')
  const lastAnalysisVideoDataUrlRef = useRef('')
  const recordingHasVideoRef = useRef(false)

  // Reuse existing real-time backend WS + webcam analyzer pipeline.
  // Must be initialized before callbacks that depend on previewStream.
  useBackendConnection()
  const { cameraStatus, cameraError, processingStatus, previewStream, monitoredFrame } = useWebcamAnalysis(cameraEnabled)

  const blobToDataUrl = useCallback((blob) => new Promise((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = reject
      reader.readAsDataURL(blob)
    } catch (e) {
      reject(e)
    }
  }), [])

  const analyzeAudioBlob = useCallback(async (blob, transcriptText, durationSecHint = 0) => {
    const fallbackDuration = Math.max(0.1, Number(durationSecHint || 0.1))
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) {
        const words = String(transcriptText || '').trim().split(/\s+/).filter(Boolean).length
        return {
          duration_sec: Number(fallbackDuration.toFixed(2)),
          avg_volume_rms: null,
          speech_rate_wpm: Math.round((words / fallbackDuration) * 60),
          pause_ratio: null,
        }
      }

      const ctx = new AudioCtx()
      const buf = await blob.arrayBuffer()
      const decoded = await ctx.decodeAudioData(buf)
      const channel = decoded.getChannelData(0)
      const duration = Math.max(0.1, decoded.duration || fallbackDuration)
      let energy = 0
      let lowEnergyCount = 0
      const silenceThreshold = 0.012
      for (let i = 0; i < channel.length; i += 1) {
        const s = channel[i]
        const abs = Math.abs(s)
        energy += s * s
        if (abs < silenceThreshold) lowEnergyCount += 1
      }
      const rms = Math.sqrt(energy / Math.max(1, channel.length))
      const pauseRatio = lowEnergyCount / Math.max(1, channel.length)
      const words = String(transcriptText || '').trim().split(/\s+/).filter(Boolean).length
      const wpm = words > 0 ? Math.round((words / duration) * 60) : 0
      try { await ctx.close() } catch {}

      return {
        duration_sec: Number(duration.toFixed(2)),
        avg_volume_rms: Number(rms.toFixed(4)),
        speech_rate_wpm: wpm,
        pause_ratio: Number(pauseRatio.toFixed(3)),
      }
    } catch {
      const words = String(transcriptText || '').trim().split(/\s+/).filter(Boolean).length
      return {
        duration_sec: Number(fallbackDuration.toFixed(2)),
        avg_volume_rms: null,
        speech_rate_wpm: Math.round((words / fallbackDuration) * 60),
        pause_ratio: null,
      }
    }
  }, [])

  const stopMediaRecording = useCallback(() => {
    try {
      const mr = mediaRecorderRef.current
      if (mr && mr.state !== 'inactive') {
        mr.stop()
      }
      const amr = analysisMediaRecorderRef.current
      if (amr && amr.state !== 'inactive') {
        amr.stop()
      }
    } catch {}
  }, [])

  const startMediaRecording = useCallback(() => {
    try {
      console.log('Starting media recording...')
      const micStream = micStreamRef.current
      console.log('Mic stream available:', !!micStream)
      if (!micStream || !window.MediaRecorder) {
        console.log('No mic stream or MediaRecorder not supported')
        recordingFinalizeRef.current = Promise.resolve(null)
        recordingFinalizeResolveRef.current = null
        return
      }

      const combinedTracks = []
      const videoTrack = previewStream?.getVideoTracks?.()?.[0]
      console.log('Video track available:', !!videoTrack)
      if (videoTrack) combinedTracks.push(videoTrack)
      const audioTrack = micStream.getAudioTracks?.()?.[0]
      console.log('Audio track available:', !!audioTrack)
      if (audioTrack) combinedTracks.push(audioTrack)
      const stream = combinedTracks.length > 0 ? new MediaStream(combinedTracks) : micStream
      recordingHasVideoRef.current = !!videoTrack
      console.log('Recording has video:', recordingHasVideoRef.current)

      recordingChunksRef.current = []
      analysisRecordingChunksRef.current = []
      recordingStartedAtRef.current = Date.now()
      recordingFinalizeRef.current = new Promise((resolve) => { recordingFinalizeResolveRef.current = resolve })
      console.log('Recording setup complete, starting MediaRecorder...')

      // Attempt to capture analysis canvas
      let canvasStream = null
      let analysisCombinedStream = null
      try {
        const c = document.getElementById('analysis-canvas')
        if (c) {
          canvasStream = c.captureStream(30)
          const analysisTracks = [canvasStream.getVideoTracks()[0]]
          if (audioTrack) analysisTracks.push(audioTrack)
          analysisCombinedStream = new MediaStream(analysisTracks)
        }
      } catch (e) {
        console.log('Could not capture analysis canvas:', e)
      }

      let mr = null
      let amr = null
      try {
        const targetType = recordingHasVideoRef.current ? 'video/webm' : 'audio/webm'
        mr = MediaRecorder.isTypeSupported?.(targetType)
          ? new MediaRecorder(stream, { mimeType: targetType })
          : new MediaRecorder(stream)
        console.log('MediaRecorder created successfully with type:', targetType)
        
        if (analysisCombinedStream) {
          amr = MediaRecorder.isTypeSupported?.('video/webm')
            ? new MediaRecorder(analysisCombinedStream, { mimeType: 'video/webm' })
            : new MediaRecorder(analysisCombinedStream)
        }
      } catch (e) {
        console.log('MediaRecorder creation failed, trying fallback:', e)
        mr = new MediaRecorder(stream)
        if (analysisCombinedStream) amr = new MediaRecorder(analysisCombinedStream)
      }
      mediaRecorderRef.current = mr
      analysisMediaRecorderRef.current = amr

      mr.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          recordingChunksRef.current.push(evt.data)
        }
      }
      if (amr) {
        amr.ondataavailable = (evt) => {
          if (evt.data && evt.data.size > 0) {
            analysisRecordingChunksRef.current.push(evt.data)
          }
        }
        amr.onstop = async () => {
          try {
            const chunks = analysisRecordingChunksRef.current || []
            const blob = new Blob(chunks, { type: 'video/webm' })
            if (blob.size) {
              lastAnalysisVideoDataUrlRef.current = await blobToDataUrl(blob)
            } else {
              lastAnalysisVideoDataUrlRef.current = ''
            }
          } catch (e) {
            console.log('Analysis video record failed', e)
          }
        }
        amr.start()
      }

      mr.onstop = async () => {
        try {
          console.log('MediaRecorder stopped, processing chunks...')
          const chunks = recordingChunksRef.current || []
          console.log('Chunks count:', chunks.length)
          const outType = recordingHasVideoRef.current ? 'video/webm' : 'audio/webm'
          const blob = new Blob(chunks, { type: outType })
          console.log('Blob created, size:', blob.size, 'type:', outType)
          if (!blob.size) {
            console.log('Blob is empty, skipping')
            lastAudioFeaturesRef.current = null
            setLastAudioFeatures(null)
            setLastRecordedAudioUrl('')
            setLastRecordedVideoUrl('')
            lastAudioDataUrlRef.current = ''
            lastVideoDataUrlRef.current = ''
            lastAnalysisVideoDataUrlRef.current = ''
            return
          }

          const durationSec = Math.max(0.1, (Date.now() - recordingStartedAtRef.current) / 1000)
          const transcriptText = String(useSessionStore.getState().learnerSpeech || '').trim()
          console.log('Analyzing audio, duration:', durationSec, 'transcript:', transcriptText)
          
          const features = await analyzeAudioBlob(blob, transcriptText, durationSec)
          const dataUrl = await blobToDataUrl(blob)
          
          console.log('Recording processed successfully, dataUrl length:', dataUrl.length)
          
          lastAudioFeaturesRef.current = features
          setLastAudioFeatures(features)
          lastAudioDataUrlRef.current = dataUrl
          setLastRecordedAudioUrl(dataUrl)
          if (recordingHasVideoRef.current) {
            lastVideoDataUrlRef.current = dataUrl
            setLastRecordedVideoUrl(dataUrl)
          } else {
            lastVideoDataUrlRef.current = ''
            setLastRecordedVideoUrl('')
          }
          
          // Wait briefly for analysis blob to resolve
          await new Promise(r => setTimeout(r, 200))
        } finally {
          if (recordingFinalizeResolveRef.current) {
            recordingFinalizeResolveRef.current(lastAudioFeaturesRef.current)
            recordingFinalizeResolveRef.current = null
          }
        }
      }

      mr.start()
      console.log('MediaRecorder started successfully')
    } catch (e) {
      console.log('Error in startMediaRecording:', e)
      recordingFinalizeRef.current = Promise.resolve(null)
      recordingFinalizeResolveRef.current = null
    }
  }, [analyzeAudioBlob, blobToDataUrl, previewStream])

  const persistSpeechProfile = useCallback((text, analysis, metricsSnapshot) => {
    try {
      const key = 'english_coach_local_profile_v1'
      const existing = JSON.parse(localStorage.getItem(key) || '{"samples":[]}')
      const tags = [
        ...(Array.isArray(analysis?.delivery_notes) ? analysis.delivery_notes : []),
        ...(Array.isArray(analysis?.pronunciation_notes) ? analysis.pronunciation_notes : []),
      ].slice(0, 6)
      const sample = {
        ts: Date.now(),
        transcript: text,
        score: analysis?.score ?? null,
        tone: analysis?.tone ?? null,
        emotion: analysis?.emotion_inference ?? null,
        follow_up_question: analysis?.follow_up_question ?? null,
        style_tags: tags,
        metrics: {
          face_detected: !!metricsSnapshot?.faceDetected,
          gaze_on_screen: !!metricsSnapshot?.gazeOnScreen,
          mouth_open_ratio: Number(metricsSnapshot?.mouthOpenRatio || 0),
          mouth_movement: Number(metricsSnapshot?.mouthMovement || 0),
          speaking_detected: !!metricsSnapshot?.speakingDetected,
        },
      }
      const samples = [sample, ...(existing.samples || [])].slice(0, 60)
      localStorage.setItem(key, JSON.stringify({ samples }))
    } catch {}
  }, [])

  useEffect(() => {
    const t = setInterval(() => setInspectorTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Archive management (PostgreSQL API) ───────────────────────────────────
  const saveSpeechArchive = useCallback(async (entry) => {
    try {
      console.log('Saving speech archive entry to PostgreSQL...')
      const response = await fetch('/api/speech-archive/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'anonymous', // Could be made configurable
          ...entry
        })
      })
      const result = await response.json()
      if (!result.ok) {
        console.error('Failed to save speech archive:', result.error)
      } else {
        console.log('Speech archive saved successfully')
      }
    } catch (error) {
      console.error('Error saving speech archive:', error)
    }
  }, [])

  const loadSpeechArchive = useCallback(async () => {
    try {
      console.log('Loading speech archive from PostgreSQL...')
      const response = await fetch('/api/speech-archive/load?user_id=anonymous&limit=20')
      const result = await response.json()
      if (result.ok) {
        console.log('Loaded archive with', result.archive.length, 'entries')
        setRecordArchive(result.archive)
        
        // Check for localStorage migration
        const raw = localStorage.getItem('english_coach_record_archive_v1')
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log('Found localStorage archive, migrating to PostgreSQL...')
              // Migrate old entries to PostgreSQL
              for (const entry of parsed.slice(0, 20)) {
                if (entry.tone !== 'ai') { // Skip AI-only entries
                  await saveSpeechArchive(entry)
                }
              }
              // Clear localStorage after migration
              localStorage.removeItem('english_coach_record_archive_v1')
              console.log('Migration complete, cleared localStorage')
            }
          } catch (e) {
            console.log('Error during migration:', e)
          }
        }
      } else {
        console.error('Failed to load speech archive:', result.error)
        setRecordArchive([])
      }
    } catch (error) {
      console.error('Error loading speech archive:', error)
      setRecordArchive([])
    }
  }, [saveSpeechArchive])

  useEffect(() => {
    // Load archive from PostgreSQL on component mount
    loadSpeechArchive()
  }, [loadSpeechArchive])

  useEffect(() => {
    // Auto-save archive changes to PostgreSQL (but not on every change to avoid spam)
    if (recordArchive.length === 0) return
    
    const timeoutId = setTimeout(() => {
      console.log('Auto-saving archive to PostgreSQL:', recordArchive.length, 'items')
      // Note: We don't save the entire archive on every change, only when explicitly saving entries
      // The archive is loaded on mount and individual entries are saved when created
    }, 1000)
    
    return () => clearTimeout(timeoutId)
  }, [recordArchive])

  useEffect(() => {
    const pickVoice = () => {
      const voices = window.speechSynthesis?.getVoices?.() || []
      const preferred = voices.find((v) => /Google US English|Samantha|Karen|Moira|Daniel|en-US/i.test(v.name))
      setSpeechVoice(preferred || voices[0] || null)
    }
    pickVoice()
    window.speechSynthesis?.addEventListener?.('voiceschanged', pickVoice)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', pickVoice)
  }, [])

  const pushEvent = useCallback((type, detail) => {
    const line = `${new Date().toLocaleTimeString('en', { hour12: false })} · ${type} · ${detail}`
    setEventLog((prev) => [line, ...prev].slice(0, 80))
  }, [])

  useEffect(() => {
    if (!previewRef.current) return
    previewRef.current.srcObject = previewStream || null
  }, [previewStream])

  useEffect(() => {
    if (!topPreviewRef.current) return
    topPreviewRef.current.srcObject = previewStream || null
  }, [previewStream])

  useEffect(() => {
    if (freshness.frameAt) {
      pushEvent('frame', `received hash ${metrics.frameHash || 'n/a'}`)
    }
  }, [freshness.frameAt, metrics.frameHash, pushEvent])

  useEffect(() => {
    if (!monitoredFrame || !metrics.frameHash) return
    setFrameHistory((prev) => {
      if (prev[0]?.hash === metrics.frameHash) return prev
      const next = [{ src: monitoredFrame, hash: metrics.frameHash, ts: Date.now() }, ...prev].slice(0, 40)
      setFrameCursor(0)
      return next
    })
  }, [monitoredFrame, metrics.frameHash])

  useEffect(() => {
    if (!metrics.faceDetected) return
    pushEvent('mouth', `open=${Number(metrics.mouthOpenRatio || 0).toFixed(2)} move=${Number(metrics.mouthMovement || 0).toFixed(2)} speaking=${metrics.speakingDetected ? 'yes' : 'no'}`)
  }, [metrics.mouthOpenRatio, metrics.mouthMovement, metrics.speakingDetected, metrics.faceDetected, pushEvent])

  // Bootstrap Vision Agents session (same path as Landing -> Session) so
  // backend EngagementProcessor is definitely initialized for /api/analyze-frame.
  const bootstrapVisionSession = useCallback(async () => {
    if (bootRef.current) return
    bootRef.current = true
    setVisionBootError('')

    try {
      const ts = Date.now()
      const userId = `english_user_${ts}`
      const callId = `english_call_${ts}`
      const sessionId = `english_sess_${ts}`

      setUser(userId, 'English Learner', null)
      startSession(sessionId, callId, 'English Communication Coaching')

      const joinRes = await fetch(`${API_BASE}/api/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: callId,
          call_type: 'default',
          user_id: userId,
          user_name: 'English Learner',
          topic: 'English Communication Coaching',
        }),
      })

      if (!joinRes.ok) throw new Error(`/api/join failed (${joinRes.status})`)

      await fetch(`${API_BASE}/api/session/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'English Communication Coaching',
          content_type: 'ai_chat',
          coach_mode: 'english',
          user_id: userId,
          call_id: callId,
        }),
      })

      setVisionBootstrapped(true)
    } catch (e) {
      setVisionBootstrapped(false)
      setVisionBootError(e?.message || 'Vision bootstrap failed')
    }
  }, [setUser, startSession])

  useEffect(() => {
    if (!cameraEnabled) return
    bootstrapVisionSession()
  }, [cameraEnabled, bootstrapVisionSession])

  useEffect(() => {
    return () => {
      stopMediaRecording()
      window.speechSynthesis?.cancel()
      setContentSource(null)
      setTopic('')
      endSession()
    }
  }, [endSession, setContentSource, setTopic, stopMediaRecording])

  // ── Generate target sentence for "Read & Repeat" mode ─────────────────
  const fetchSentence = useCallback(async () => {
    try {
      const data = await generateSentence(level)
      setTargetSentence(data.sentence || '')
    } catch {
      setTargetSentence('Tell me about your favorite hobby and why you enjoy it.')
    }
  }, [level])

  useEffect(() => {
    if (mode === 'repeat') fetchSentence()
  }, [mode, level, fetchSentence])

  const ensureMicrophoneEnabled = useCallback(async () => {
    if (micEnabled) return true
    try {
      setMicStatus('requesting')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      micStreamRef.current = stream
      setMicEnabled(true)
      setMicStatus('enabled')
      pushEvent('mic', 'enabled')
      return true
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError'
      setMicEnabled(false)
      setMicStatus(denied ? 'denied' : 'error')
      setError(denied ? 'Microphone permission denied. Please enable microphone access in your browser.' : `Microphone setup failed: ${e?.message || 'unknown error'}`)
      pushEvent('mic', `enable failed: ${String(e?.message || e)}`)
      return false
    }
  }, [micEnabled, pushEvent])

  // ── Speech recognition ─────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    console.log('startListening called')
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Speech recognition not supported in this browser. Use Chrome or Edge.')
      return
    }

    if (!micEnabled) {
      const ok = await ensureMicrophoneEnabled()
      console.log('Microphone enabled:', ok)
      if (!ok) {
        pushEvent('gate', 'blocked speech start: microphone permission denied')
        return
      }
    }

    const frameAgeMs = freshness.frameAt ? Date.now() - freshness.frameAt : Infinity
    const visionLive = cameraEnabled && visionBootstrapped && cameraStatus === 'running' && processingStatus === 'processing' && frameAgeMs < 2500
    console.log('Speech start check:', { visionLive, cameraEnabled, visionBootstrapped, cameraStatus, processingStatus, frameAgeMs, readinessOverride })
    if (!visionLive && !readinessOverride) {
      setError('Monitoring not live yet. Enable camera and wait for stable face/frame signals before speaking.')
      pushEvent('gate', 'blocked speech start: readiness not green')
      return
    }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    setTranscript('')
    setInterimText('')
    setError('')
    setIsListening(true)
    micRetryRef.current = 0
    // Allow re-analyzing the same sentence in a new turn.
    lastAutoAnalyzedRef.current = ''
    startMediaRecording()

    rec.onresult = (e) => {
      console.log('Speech recognition result received')
      let interim = ''
      let final   = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      console.log('Speech result:', { final: final.trim(), interim: interim.trim() })
      if (final)   setTranscript(final)
      if (interim) setInterimText(interim)
    }

    rec.onerror = (e) => {
      if (e.error === 'no-speech') {
        setError('No speech detected. Speak louder and keep talking for 1-2 seconds.')
        pushEvent('mic', 'no-speech detected')
        setIsListening(false)
        return
      }

      if (e.error === 'network' && micRetryRef.current < 2) {
        micRetryRef.current += 1
        setError('Microphone network glitch. Retrying...')
        pushEvent('mic', `network retry ${micRetryRef.current}`)
        setTimeout(() => {
          try { rec.start() } catch {}
        }, 800)
        return
      }
      pushEvent('mic', `error ${e.error}`)
      setError(`Microphone error: ${e.error}.`)
      setIsListening(false)
    }

    rec.onend = () => {
      console.log('Speech recognition ended')
      stopMediaRecording()
      setIsListening(false)
      setInterimText('')
      micRetryRef.current = 0
      pushEvent('mic', 'listening ended')
    }

    recognitionRef.current = rec
    rec.start()
    pushEvent('mic', 'listening started')
  }, [cameraEnabled, visionBootstrapped, cameraStatus, processingStatus, freshness.frameAt, readinessOverride, micEnabled, pushEvent, ensureMicrophoneEnabled, startMediaRecording, stopMediaRecording])

  const stopListening = useCallback(() => {
    stopMediaRecording()
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [stopMediaRecording])

  const toggleMicrophone = useCallback(async () => {
    if (micEnabled) {
      stopMediaRecording()
      micStreamRef.current?.getTracks()?.forEach((t) => t.stop())
      micStreamRef.current = null
      setMicEnabled(false)
      setMicStatus('idle')
      pushEvent('mic', 'disabled')
      return
    }

    await ensureMicrophoneEnabled()
  }, [micEnabled, pushEvent, ensureMicrophoneEnabled, stopMediaRecording])

  const speakText = useCallback((text, onEndCallback = null) => {
    const spoken = (text || '').trim()
    if (!spoken || !window.speechSynthesis) {
      if (onEndCallback) onEndCallback()
      return
    }
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
      
      const u = new SpeechSynthesisUtterance(spoken.replace(/Algsoch/g, 'Alagsoch'))
      if (speechVoice) u.voice = speechVoice
      
      u.rate = 1.0
      u.pitch = 1.0
      u.volume = 1.0
      
      let callbackFired = false
      const fireCallback = () => {
        if (!callbackFired) {
          callbackFired = true
          if (onEndCallback) onEndCallback()
        }
      }
      
      u.onend = fireCallback
      u.onerror = fireCallback
      
      // Fallback in case onend doesn't fire (common browser bug)
      setTimeout(fireCallback, Math.max(3000, spoken.length * 70))
      
      // Prevent garbage collection bug in Chrome/Safari
      window._currentTtsUtterance = u
      
      console.log('TTS playing:', spoken.slice(0, 40))
      
      if (window.speechSynthesis.resume) {
        window.speechSynthesis.resume()
      }
      window.speechSynthesis.speak(u)
      
      pushEvent('tts', `speak ${spoken.slice(0, 64)}${spoken.length > 64 ? '…' : ''}`)
    } catch (e) {
      pushEvent('tts', `error ${String(e?.message || e)}`)
      if (onEndCallback) onEndCallback()
    }
  }, [speechVoice, pushEvent])

  useEffect(() => {
    if (!visionBootstrapped || aiStartedRef.current) return
    aiStartedRef.current = true
    pushEvent('coach', 'ready: select mode and tap Start Test')
  }, [visionBootstrapped, pushEvent])

  const startModeTest = useCallback(async () => {
    // Prime the TTS engine synchronously on user click to prevent Chrome/Safari blocking down the line
    if (window.speechSynthesis) {
        const dummy = new SpeechSynthesisUtterance('');
        dummy.volume = 0;
        window.speechSynthesis.speak(dummy);
    }

    if (!cameraEnabled) {
      setError('Enable camera first to start the selected mode.')
      return
    }
    if (!visionBootstrapped) {
      setError('Vision pipeline is still bootstrapping. Please wait a moment and try again.')
      return
    }

    setError('')
    let starter = ''

    if (mode === 'topic') {
      const topic = String(topicPrompt || '').trim()
      if (!topic) {
        setError('Please enter a topic first, then tap Start Topic Test.')
        return
      }
      starter = level === 'beginner'
        ? `Topic Chat started for ${topic}. First question: What is ${topic} in simple words, and why do you like it?`
        : level === 'advanced'
          ? `Topic Chat started for ${topic}. First question: Explain one real-world problem in ${topic} and your proposed approach.`
          : `Topic Chat started for ${topic}. First question: What interests you most about ${topic}, and why?`
    } else if (mode === 'repeat') {
      let sentence = String(targetSentence || '').trim()
      if (!sentence) {
        try {
          const generated = await generateSentence(level)
          sentence = String(generated?.sentence || '').trim()
          if (sentence) setTargetSentence(sentence)
        } catch {}
      }
      starter = sentence
        ? `Read this sentence aloud: ${sentence}`
        : 'Repeat mode started. Tap New sentence, then speak.'
    } else {
      starter = 'Free Speech started. What would you like to talk about today? Please tell me your chosen topic first, then speak freely for 20 to 40 seconds. I will analyze your delivery, expression, and speaking style.'
    }

    setAgentTranscript(starter)
    setAgentSpeech(starter)
    setSignalFreshness('agentSpeechAt')
    addConversationEntry('ai', starter, 'mode_start')
    setLastFeedbackSpeech(starter)
    pushEvent('coach', `mode start: ${mode}`)
    if (speakFeedback) {
      speakText(starter, () => {
        // Auto-start listening after AI introduction for Free Speech mode
        if (mode === 'free') {
          const frameAgeMs = freshness.frameAt ? Date.now() - freshness.frameAt : Infinity
          const visionLive = cameraEnabled && visionBootstrapped && cameraStatus === 'running' && processingStatus === 'processing' && frameAgeMs < 2500
          
          if (visionLive || readinessOverride) {
            console.log('Auto-starting listening after AI introduction')
            setTimeout(() => startListening(), 500) // Small delay after TTS finishes
          } else {
            console.log('Controls locked, cannot auto-start listening')
          }
        }
      })
    }
  }, [
    cameraEnabled,
    visionBootstrapped,
    mode,
    topicPrompt,
    targetSentence,
    level,
    speakFeedback,
    speakText,
    setAgentTranscript,
    setAgentSpeech,
    setSignalFreshness,
    addConversationEntry,
    pushEvent,
    cameraStatus,
    processingStatus,
    freshness.frameAt,
    readinessOverride,
    startListening,
  ])

  useEffect(() => {
    if (!result) return
    setNewOutputBadge(true)
    const t = setTimeout(() => setNewOutputBadge(false), 5000)
    return () => clearTimeout(t)
  }, [result])

  // ── Analyze transcript ─────────────────────────────────────────────────
  const handleAnalyze = useCallback(async (inputText = null) => {
    const text = String(inputText ?? transcript).trim()
    if (!text) { setError('No speech detected. Try again.'); return }

    const frameAgeMs = freshness.frameAt ? Date.now() - freshness.frameAt : Infinity
    const visionLive = cameraEnabled && visionBootstrapped && cameraStatus === 'running' && processingStatus === 'processing' && frameAgeMs < 2500
    if (!visionLive && !readinessOverride) {
      setError('Monitoring pipeline is not live. Enable camera and wait for fresh frame signal before analysis.')
      pushEvent('gate', 'blocked analyze: readiness not green')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const analysisMode = mode === 'repeat' ? 'repeat' : mode === 'topic' ? 'topic' : 'analyze'
      const visionReady = cameraEnabled && cameraStatus === 'running' && processingStatus === 'processing' && (metrics.frameFps || 0) > 0
      const payloadGazeDirection = (() => {
        const yaw = Number(metrics.headYaw || 0)
        const pitch = Number(metrics.headPitch || 0)
        if (!metrics.gazeOnScreen) {
          if (Math.abs(yaw) < 9 && Math.abs(pitch) < 9) return 'center'
          return 'away'
        }
        if (Math.abs(yaw) < 8 && Math.abs(pitch) < 8) return 'center'
        if (yaw > 12) return 'right'
        if (yaw < -12) return 'left'
        if (pitch < -10) return 'up'
        if (pitch > 10) return 'down'
        return 'center'
      })()
      const visionPayload = visionReady ? {
        face_detected: metrics.faceDetected,
        gaze_on_screen: metrics.gazeOnScreen,
        gaze_direction: payloadGazeDirection,
        blink_rate: metrics.blinkRate,
        restlessness: metrics.restlessness,
        head_yaw: metrics.headYaw,
        head_pitch: metrics.headPitch,
        people_count: metrics.peopleCount,
        frame_fps: metrics.frameFps,
        fixation_duration: metrics.fixationDuration,
        eye_closure_duration: metrics.eyeClosureDuration,
        mouth_open_ratio: metrics.mouthOpenRatio,
        mouth_movement: metrics.mouthMovement,
        speaking_detected: metrics.speakingDetected,
        tongue_score: metrics.tongueScore,
        tongue_visible: metrics.tongueVisible,
      } : {}
      setLearnerSpeech(text)
      setSignalFreshness('learnerSpeechAt')
      addConversationEntry('user', text)
      pushEvent('transcript', text)
      const reqStarted = performance.now()
      pushEvent('groq', `request start mode=${analysisMode}`)
      const modeText = analysisMode === 'topic' && topicPrompt.trim()
        ? `Topic: ${topicPrompt.trim()}. Learner response: ${text}`
        : text
      const previousFollowUp = String(result?.follow_up_question || lastGroqResponseSummary?.follow_up_question || '').trim()
      const recentTurns = (conversationLog || []).slice(-6).map((entry) => ({
        role: entry.role,
        text: String(entry.text || ''),
      }))
      const conversationContext = {
        previous_follow_up_question: previousFollowUp || null,
        follow_up_answer_expected: !!previousFollowUp,
        previous_ai_message: String(agentSpeechLive || '').trim() || null,
        recent_turns: recentTurns,
      }
      const speakingStyleContext = {
        articulation_score: Math.max(0, Math.min(100, Math.round((Number(metrics.mouthMovement || 0) * 120) + (Number(metrics.mouthOpenRatio || 0) * 100)))),
        mouth_open_ratio: Number(metrics.mouthOpenRatio || 0),
        mouth_movement: Number(metrics.mouthMovement || 0),
        speaking_detected: !!metrics.speakingDetected,
        tongue_score: Number(metrics.tongueScore || 0),
        blink_rate: Number(metrics.blinkRate || 0),
        audio_duration_sec: Number(lastAudioFeaturesRef.current?.duration_sec || 0),
        avg_volume_rms: lastAudioFeaturesRef.current?.avg_volume_rms ?? null,
        speech_rate_wpm: Number(lastAudioFeaturesRef.current?.speech_rate_wpm || 0),
        pause_ratio: lastAudioFeaturesRef.current?.pause_ratio ?? null,
      }
      setLastTranscriptPayload({
        transcript: text,
        effective_transcript: modeText,
        mode: analysisMode,
        topic_prompt: topicPrompt.trim() || null,
        conversation_context: conversationContext,
        speaking_style_context: speakingStyleContext,
      })
      setLastVisionPayload(visionPayload)
      const data = await analyzeWithGroq(modeText, analysisMode, {
        ...visionPayload,
      }, conversationContext, speakingStyleContext, level)
      setResult(data)
      persistSpeechProfile(text, data, metrics)
      setLastGroqResponseSummary({
        score: data.score ?? null,
        tone: data.tone ?? null,
        overall_feedback: data.overall_feedback ?? null,
        improvement_tip: data.improvement_tip ?? null,
        emotion_inference: data.emotion_inference ?? null,
        speaking_style_notes: Array.isArray(data.speaking_style_notes) ? data.speaking_style_notes.slice(0, 4) : [],
        follow_up_relevance_score: data.follow_up_relevance_score ?? null,
        follow_up_relevance_feedback: data.follow_up_relevance_feedback ?? null,
        how_you_should_say_it: data.how_you_should_say_it ?? null,
        next_answer_blueprint: data.next_answer_blueprint ?? null,
        follow_up_question: data.follow_up_question ?? null,
        action_plan: Array.isArray(data.action_plan) ? data.action_plan.slice(0, 3) : [],
        corrections_count: Array.isArray(data.corrections) ? data.corrections.length : 0,
        model_used: data.model_used ?? null,
      })
      if (previousFollowUp || typeof data.follow_up_relevance_score === 'number' || data.follow_up_relevance_feedback) {
        setFollowUpThread((prev) => [{
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          askedQuestion: previousFollowUp || null,
          learnerAnswer: text,
          relevanceScore: typeof data.follow_up_relevance_score === 'number' ? data.follow_up_relevance_score : null,
          relevanceFeedback: data.follow_up_relevance_feedback || '',
          nextFollowUp: String(data.follow_up_question || '').trim() || null,
          ts: Date.now(),
        }, ...prev].slice(0, 8))
      }
      const reqMs = Math.max(0, Math.round(performance.now() - reqStarted))
      pushEvent('groq', `response ${reqMs}ms score=${data.score ?? 'n/a'}`)
      const shortOverall = (data.overall_feedback || '').split('.').slice(0, 1).join('.').trim()
      const followUp = String(data.follow_up_question || '').trim()
      const relationCue = typeof data.follow_up_relevance_score === 'number'
        ? `Follow-up relevance ${data.follow_up_relevance_score} out of 100`
        : ''
      const rewriteCue = String(data.how_you_should_say_it || '').trim()
      const spokenFeedback = [
        shortOverall || data.overall_feedback || '',
        relationCue,
        rewriteCue ? `You can say: ${rewriteCue}` : '',
        data.improvement_tip || '',
        followUp ? `Follow-up question: ${followUp}` : '',
      ].filter(Boolean).join('. ').trim()
      if (spokenFeedback) {
        setLastFeedbackSpeech(spokenFeedback)
        setAgentTranscript(spokenFeedback)
        setAgentSpeech(spokenFeedback)
        setSignalFreshness('agentSpeechAt')
        addConversationEntry('ai', spokenFeedback, 'english_feedback')
        if (speakFeedback && window.speechSynthesis) {
          speakText(spokenFeedback)
        }
      }
      setSessionScore((prev) => [...prev, data.score ?? 70])
      setHistory((prev) => [{ transcript: text, result: data, ts: Date.now() }, ...prev].slice(0, 20))
      const archiveEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        transcript: text,
        score: data.score ?? null,
        tone: data.tone ?? null,
        follow_up_relevance_score: data.follow_up_relevance_score ?? null,
        how_you_should_say_it: data.how_you_should_say_it ?? null,
        overall_feedback: data.overall_feedback ?? null,
        speaking_style_notes: Array.isArray(data.speaking_style_notes) ? data.speaking_style_notes.slice(0, 4) : [],
        audio_features: lastAudioFeaturesRef.current || null,
        audio_data_url: lastAudioDataUrlRef.current || null,
        video_data_url: lastVideoDataUrlRef.current || null,
        analysis_video_data_url: lastAnalysisVideoDataUrlRef.current || null,
      }
      
      setRecordArchive((prev) => [archiveEntry, ...prev].slice(0, 20))
      
      // Save to PostgreSQL API
      saveSpeechArchive(archiveEntry)

      // Auto-generate next sentence if in repeat mode
      if (mode === 'repeat') fetchSentence()
    } catch (err) {
      pushEvent('groq', `error ${String(err?.message || err)}`)
      setError('Analysis failed. Check your connection and try again.')
    } finally {
      setLoading(false)
      setPendingConfirm(false) // Ensure confirmation state is cleared
    }
  }, [
    transcript,
    mode,
    level,
    fetchSentence,
    cameraEnabled,
    visionBootstrapped,
    cameraStatus,
    processingStatus,
    freshness.frameAt,
    readinessOverride,
    topicPrompt,
    metrics,
    conversationLog,
    agentSpeechLive,
    result?.follow_up_question,
    lastGroqResponseSummary?.follow_up_question,
    setLearnerSpeech,
    setAgentSpeech,
    setAgentTranscript,
    setSignalFreshness,
    addConversationEntry,
    speakFeedback,
    speakText,
    pushEvent,
    persistSpeechProfile,
    saveSpeechArchive,
  ])

  // Auto-analyze each new transcript when STT stops.
  useEffect(() => {
    if (isListening || loading || pendingConfirm) return
    const normalized = String(transcript || '').trim()
    if (!normalized) return
    if (normalized === lastAutoAnalyzedRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        await Promise.race([
          recordingFinalizeRef.current,
          new Promise((resolve) => setTimeout(resolve, 1200)),
        ])
      } catch {}
      if (cancelled) return
      setEditableTranscript(normalized)
      setPendingConfirm(true)
      speakText("Your speech has been recorded. Please review the transcript below and choose to confirm and analyze, or discard it.")
      pushEvent('transcript', 'awaiting confirmation before analysis')
    })()
    return () => { cancelled = true }
  }, [isListening, transcript, loading, pendingConfirm, pushEvent])

  const confirmAndAnalyze = useCallback(() => {
    const cleaned = String(editableTranscript || '').trim()
    if (!cleaned) {
      setError('Transcript is empty. Speak again or edit text before analysis.')
      return
    }
    setTranscript(cleaned)
    setPendingConfirm(false)
    lastAutoAnalyzedRef.current = cleaned
    handleAnalyze(cleaned)
  }, [editableTranscript, handleAnalyze])

  const discardTranscript = useCallback(() => {
    setPendingConfirm(false)
    setTranscript('')
    setInterimText('')
    setEditableTranscript('')
    setError('')
    setLastRecordedAudioUrl('')
    setLastRecordedVideoUrl('')
    lastAudioDataUrlRef.current = ''
    lastVideoDataUrlRef.current = ''
    lastAnalysisVideoDataUrlRef.current = ''
  }, [])

  const avgScore = sessionScore.length
    ? Math.round(sessionScore.reduce((a, b) => a + b, 0) / sessionScore.length)
    : null

  const signalHealth = useMemo(() => {
    const now = inspectorTick
    const frameAgeMs = freshness.frameAt ? (now - freshness.frameAt) : Infinity
    const visionLive = cameraEnabled && visionBootstrapped && cameraStatus === 'running' && processingStatus === 'processing' && frameAgeMs < 2500
    const micReady = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    const speechSyncScore = (() => {
      const learnerAgeMs = freshness.learnerSpeechAt ? now - freshness.learnerSpeechAt : Infinity
      if (metrics.speakingDetected && learnerAgeMs < 8000) return 90
      if (metrics.speakingDetected && learnerAgeMs >= 8000) return 45
      if (!metrics.speakingDetected && learnerAgeMs < 8000) return 40
      return 70
    })()
    return { visionLive, micReady, speechSyncScore, frameAgeMs }
  }, [inspectorTick, freshness, cameraEnabled, visionBootstrapped, cameraStatus, processingStatus, metrics.speakingDetected])

  const micEngineLabel = useMemo(() => {
    if (!signalHealth.micReady) return 'not-supported (optional)'
    if (micEnabled) return 'enabled'
    if (micStatus === 'requesting') return 'requesting permission'
    if (micStatus === 'denied') return 'permission-denied'
    return 'ready (tap speak to request)'
  }, [signalHealth.micReady, micEnabled, micStatus])

  const effectiveFaceDetected = useMemo(() => {
    if (metrics.faceDetected) return true
    if (metrics.tongueVisible) return true
    if ((metrics.mouthOpenRatio || 0) > 0.02) return true
    if ((metrics.mouthMovement || 0) > 0.03) return true
    return false
  }, [metrics.faceDetected, metrics.tongueVisible, metrics.mouthOpenRatio, metrics.mouthMovement])

  const effectiveGazeDirection = useMemo(() => {
    const yaw = Number(metrics.headYaw || 0)
    const pitch = Number(metrics.headPitch || 0)
    if (!metrics.gazeOnScreen) {
      if (Math.abs(yaw) < 9 && Math.abs(pitch) < 9) return 'center'
      return 'away'
    }
    if (Math.abs(yaw) < 8 && Math.abs(pitch) < 8) return 'center'
    if (yaw > 12) return 'right'
    if (yaw < -12) return 'left'
    if (pitch < -10) return 'up'
    if (pitch > 10) return 'down'
    return 'center'
  }, [metrics.gazeOnScreen, metrics.headYaw, metrics.headPitch])

  const readiness = useMemo(() => {
    const frameFresh = Number.isFinite(signalHealth.frameAgeMs) && signalHealth.frameAgeMs < 2500
    const faceReady = effectiveFaceDetected
    const sdkReady = cameraEnabled && visionBootstrapped && cameraStatus === 'running' && processingStatus === 'processing'
    const micReady = signalHealth.micReady && micEnabled
    const score = [frameFresh, faceReady, sdkReady].filter(Boolean).length
    const state = score === 3 ? 'green' : score >= 2 ? 'yellow' : 'red'
    return { state, frameFresh, faceReady, sdkReady, micReady }
  }, [signalHealth.frameAgeMs, signalHealth.micReady, effectiveFaceDetected, cameraEnabled, visionBootstrapped, cameraStatus, processingStatus, micEnabled])

  const controlsLocked = !(readiness.frameFresh && readiness.faceReady && readiness.sdkReady)

  const visionSdkStatus =
    !cameraEnabled ? 'camera-off' :
    !visionBootstrapped ? 'bootstrapping' :
    (cameraStatus === 'running' && processingStatus === 'processing') ? 'active' :
    (cameraStatus === 'running' && processingStatus === 'backend_offline') ? 'backend-offline' :
    (cameraStatus === 'denied') ? 'permission-denied' : 'starting'

  const streamUsage = useMemo(() => {
    return {
      streamSession: visionBootstrapped ? 'active' : 'not-active',
      streamTransport: 'used for session join + signaling',
      visionTransport: 'browser camera -> /api/analyze-frame',
      visionMode: 'primary face metrics do not depend on Stream video frames',
    }
  }, [visionBootstrapped])

  const noFaceReasons = useMemo(() => {
    if (effectiveFaceDetected) return ['Face is detected and tracked.']

    const reasons = []
    if (!cameraEnabled) reasons.push('Camera is disabled.')
    if (cameraStatus === 'denied') reasons.push('Camera permission is denied by browser.')
    if (cameraStatus === 'error') reasons.push(`Camera error: ${cameraError || 'unknown'}.`)
    if (!visionBootstrapped) reasons.push('Vision session has not finished bootstrapping.')
    if (processingStatus === 'backend_offline') reasons.push('Frame analyzer backend is offline or not responding.')
    if ((metrics.frameFps || 0) <= 0) reasons.push('No analyzed frames are arriving (FPS is zero).')
    if (!Number.isFinite(signalHealth.frameAgeMs) || signalHealth.frameAgeMs >= 2500) {
      reasons.push('Latest analyzed frame is stale.')
    }
    if ((metrics.peopleCount || 0) > 1) reasons.push('Multiple people in frame can reduce stable single-face tracking.')
    if ((metrics.mouthOpenRatio || 0) === 0 && (metrics.mouthMovement || 0) === 0 && (metrics.frameFps || 0) > 0) {
      reasons.push('Landmarks are likely not being found in the visible face region.')
    }

    return reasons.length ? reasons : ['Face landmarks were not detected in the current frame.']
  }, [
    effectiveFaceDetected,
    metrics.peopleCount,
    metrics.mouthOpenRatio,
    metrics.mouthMovement,
    metrics.frameFps,
    cameraEnabled,
    cameraStatus,
    cameraError,
    visionBootstrapped,
    processingStatus,
    signalHealth.frameAgeMs,
  ])

  const enginePath = useMemo(() => {
    const realtimeAgentActive = agentStatus === 'connected' && !!streamCallId && visionBootstrapped
    const visionSource = metrics.mpLandmarksOn
      ? 'Browser MediaPipe landmarks (realtime)'
      : (cameraEnabled ? 'Backend frame analyzer fallback' : 'Camera off')

    return {
      modeBadge: realtimeAgentActive ? 'algsoch vision active' : 'hybrid coach fallback active',
      coachRouting: realtimeAgentActive
        ? 'Default route: full vision-agent realtime coach is active.'
        : 'Realtime route unavailable; automatically using hybrid coach fallback.',
      visionSource,
      realtimeAgentSource: realtimeAgentActive
        ? `Vision-Agents + Gemini via Stream (${streamCallType || 'default'})`
        : 'inactive (fallback mode: local vision + Groq)',
      sttSource: 'Browser SpeechRecognition (live)',
      llmSource: 'Groq llama-3.3-70b-versatile',
      emotionSource: 'Vision metrics + delivery/prosody hints from transcript analysis',
      realtimeAgentActive,
    }
  }, [agentStatus, streamCallId, streamCallType, visionBootstrapped, metrics.mpLandmarksOn, cameraEnabled])

  const activeFollowUp = useMemo(() => {
    return String(result?.follow_up_question || lastGroqResponseSummary?.follow_up_question || '').trim()
  }, [result?.follow_up_question, lastGroqResponseSummary?.follow_up_question])

  const speakingNow = useMemo(() => {
    const speechApiSpeaking = typeof window !== 'undefined' && !!window.speechSynthesis?.speaking
    const recentAgentSpeech = freshness.agentSpeechAt ? (inspectorTick - freshness.agentSpeechAt) < 6000 : false
    return speechApiSpeaking || recentAgentSpeech
  }, [freshness.agentSpeechAt, inspectorTick])

  const pronunciationLive = useMemo(() => {
    const mouthOpen = Number(metrics.mouthOpenRatio || 0)
    const mouthMove = Number(metrics.mouthMovement || 0)
    const articulation = Math.max(0, Math.min(100, Math.round((mouthMove * 120) + (mouthOpen * 100))))
    const delivery = metrics.speakingDetected ? 'active speech' : 'waiting speech'
    return {
      mouthOpen,
      mouthMove,
      articulation,
      delivery,
      tongue: Number(metrics.tongueScore || 0),
    }
  }, [metrics.mouthOpenRatio, metrics.mouthMovement, metrics.speakingDetected, metrics.tongueScore])

  const latestFollowUpTurn = useMemo(() => followUpThread[0] || null, [followUpThread])

  const modeStartBlockers = useMemo(() => {
    const reasons = []
    if (loading) reasons.push('Analysis is running.')
    if (!cameraEnabled) reasons.push('Camera is off.')
    if (!visionBootstrapped) reasons.push('Vision bootstrapping is not complete.')
    if (mode === 'topic' && !String(topicPrompt || '').trim()) reasons.push('Topic is empty.')
    return reasons
  }, [loading, cameraEnabled, visionBootstrapped, mode, topicPrompt])

  const canStartMode = modeStartBlockers.length === 0

  const speakSuggestion = useCallback(() => {
    const txt = String(result?.how_you_should_say_it || lastGroqResponseSummary?.how_you_should_say_it || '').trim()
    if (!txt) return
    speakText(txt)
  }, [result?.how_you_should_say_it, lastGroqResponseSummary?.how_you_should_say_it, speakText])

  return (
    <div className="h-screen bg-void flex flex-col overflow-hidden">
      <AgentStatusBar />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between px-6 py-4 border-b border-border
                   sticky top-0 bg-void/95 backdrop-blur z-10"
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-text-muted hover:text-text-primary transition-colors text-sm">
            ← Back
          </button>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-xl">
            🗣
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary leading-tight">English AI Coach</h1>
            <p className="text-xs text-text-muted">Powered by Groq · LLaMA 3.3</p>
          </div>
        </div>
        {avgScore != null && (
          <div className="flex items-center gap-2 bg-surface/60 border border-border rounded-xl px-3 py-1.5">
            <span className="text-xs text-text-muted">Session avg</span>
            <span className="font-bold font-mono text-emerald-400">{avgScore}</span>
          </div>
        )}
      </motion.header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-surface/50 border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-text-muted uppercase tracking-wide font-medium">Conversation Thread Continuity</div>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              {latestFollowUpTurn?.relevanceScore != null ? `relation ${latestFollowUpTurn.relevanceScore}/100` : 'waiting relation'}
            </span>
          </div>
          {latestFollowUpTurn ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="bg-muted/30 rounded px-2 py-1.5">
                <div className="text-text-muted mb-1">Previous follow-up question</div>
                <div className="text-text-primary leading-relaxed">{latestFollowUpTurn.askedQuestion || 'No prior follow-up in this turn.'}</div>
              </div>
              <div className="bg-muted/30 rounded px-2 py-1.5">
                <div className="text-text-muted mb-1">Your latest answer</div>
                <div className="text-text-primary leading-relaxed">{latestFollowUpTurn.learnerAnswer || 'No answer captured yet.'}</div>
              </div>
              <div className="bg-muted/30 rounded px-2 py-1.5">
                <div className="text-text-muted mb-1">Relation feedback</div>
                <div className="text-text-primary leading-relaxed">{latestFollowUpTurn.relevanceFeedback || 'Relation feedback will appear after analysis.'}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-text-muted">No linked follow-up turn yet. After your next answer, this panel will show question-answer relation immediately.</div>
          )}

          {followUpThread.length > 1 && (
            <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
              {followUpThread.slice(1, 6).map((turn) => (
                <div key={turn.id} className="text-[11px] text-text-secondary bg-muted/20 rounded px-2 py-1">
                  <span className="text-text-primary font-mono mr-2">{turn.relevanceScore != null ? `${turn.relevanceScore}/100` : '--/100'}</span>
                  {turn.askedQuestion ? `Q: ${turn.askedQuestion} | ` : ''}A: {turn.learnerAnswer}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface/50 border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-text-muted uppercase tracking-wide font-medium">Active engine path</div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${enginePath.realtimeAgentActive ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>
              {enginePath.modeBadge}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            <div className={`rounded-lg border px-2 py-1.5 ${enginePath.realtimeAgentActive ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border bg-muted/20'}`}>
              <div className="flex items-center gap-2">
                <img
                  src="/avtar.jpg"
                  alt="algsoch1 avatar"
                  className={`w-7 h-7 rounded-full object-cover border ${enginePath.realtimeAgentActive ? 'border-emerald-400/60' : 'border-border'} ${enginePath.realtimeAgentActive && speakingNow ? 'animate-pulse' : ''}`}
                />
                <span className={`inline-block w-2 h-2 rounded-full ${enginePath.realtimeAgentActive ? (speakingNow ? 'bg-emerald-300 animate-pulse' : 'bg-emerald-500') : 'bg-text-muted/40'}`} />
                <span className="text-xs text-text-primary font-medium">algsoch1</span>
              </div>
              <div className="text-[11px] text-text-secondary mt-1">Realtime coach avatar</div>
            </div>
            <div className={`rounded-lg border px-2 py-1.5 ${!enginePath.realtimeAgentActive ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-muted/20'}`}>
              <div className="flex items-center gap-2">
                <img
                  src="/avtar.jpg"
                  alt="algsoch2 avatar"
                  className={`w-7 h-7 rounded-full object-cover border ${!enginePath.realtimeAgentActive ? 'border-amber-400/60' : 'border-border'} ${!enginePath.realtimeAgentActive && speakingNow ? 'animate-pulse' : ''}`}
                />
                <span className={`inline-block w-2 h-2 rounded-full ${!enginePath.realtimeAgentActive ? (speakingNow ? 'bg-amber-300 animate-pulse' : 'bg-amber-500') : 'bg-text-muted/40'}`} />
                <span className="text-xs text-text-primary font-medium">algsoch2</span>
              </div>
              <div className="text-[11px] text-text-secondary mt-1">Hybrid fallback avatar</div>
            </div>
          </div>
          <div className="text-[11px] text-text-secondary mb-2">{enginePath.coachRouting}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            <div className="bg-muted/30 rounded px-2 py-1.5">
              <div className="text-text-muted mb-1">Vision source</div>
              <div className="text-text-primary">{enginePath.visionSource}</div>
            </div>
            <div className="bg-muted/30 rounded px-2 py-1.5">
              <div className="text-text-muted mb-1">Realtime agent source</div>
              <div className="text-text-primary">{enginePath.realtimeAgentSource}</div>
            </div>
            <div className="bg-muted/30 rounded px-2 py-1.5">
              <div className="text-text-muted mb-1">STT source</div>
              <div className="text-text-primary">{enginePath.sttSource}</div>
            </div>
            <div className="bg-muted/30 rounded px-2 py-1.5">
              <div className="text-text-muted mb-1">LLM source</div>
              <div className="text-text-primary">{enginePath.llmSource}</div>
            </div>
            <div className="bg-muted/30 rounded px-2 py-1.5 md:col-span-2 lg:col-span-2">
              <div className="text-text-muted mb-1">Emotion/Expression judgment path</div>
              <div className="text-text-primary">{enginePath.emotionSource}</div>
            </div>
          </div>
        </div>

        <div className={`border rounded-xl px-4 py-3 ${
          readiness.state === 'green' ? 'border-emerald-500/40 bg-emerald-500/10' :
          readiness.state === 'yellow' ? 'border-amber-500/40 bg-amber-500/10' :
          'border-crimson/40 bg-crimson/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-text-primary">Coach Readiness</div>
            <div className={`text-xs font-mono uppercase ${
              readiness.state === 'green' ? 'text-emerald-400' : readiness.state === 'yellow' ? 'text-amber-400' : 'text-crimson'
            }`}>{readiness.state}</div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary">
            <div>Frame fresh: <span className="font-mono text-text-primary">{readiness.frameFresh ? 'yes' : 'no'}</span></div>
            <div>Face detected: <span className="font-mono text-text-primary">{readiness.faceReady ? 'yes' : 'no'}</span></div>
            <div>Vision SDK: <span className="font-mono text-text-primary">{readiness.sdkReady ? 'ready' : 'not-ready'}</span></div>
              <div>Mic engine: <span className="font-mono text-text-primary">{micEngineLabel}</span></div>
          </div>
          {controlsLocked && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-text-secondary">Speak and Analyze are hard-disabled until readiness is green.</span>
              <button
                onClick={() => setReadinessOverride((v) => !v)}
                className={`text-xs px-2 py-1 rounded border ${
                  readinessOverride
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-border text-text-muted hover:border-amber-500/30'
                }`}
              >
                {readinessOverride ? 'Override on' : 'Audio-only override'}
              </button>
            </div>
          )}
          {readinessOverride && (
            <div className="mt-2 text-[11px] text-amber-300">Override active: user-controlled start enabled even when vision checks are not fully green.</div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start">
        <div className="bg-surface/50 border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-text-muted uppercase tracking-wide font-medium">Live monitored feed (Vision SDK)</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAiCommunication((v) => !v)}
                className="text-[11px] px-2 py-1 rounded border border-border text-text-muted hover:border-pulse/40 hover:text-pulse transition-all"
              >
                {showAiCommunication ? 'Hide AI communication' : 'Show AI communication'}
              </button>
              <button
                onClick={() => setCameraEnabled((v) => !v)}
                className={`text-[11px] px-2 py-1 rounded border transition-all ${
                  cameraEnabled
                    ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                    : 'border-border text-text-muted hover:border-emerald-500/30 hover:text-emerald-400'
                }`}
              >
                {cameraEnabled ? 'Disable Camera' : 'Enable Camera'}
              </button>
            </div>
          </div>
          <div className="text-[11px] text-text-muted mb-2">Frame-by-frame analysis at ~{metrics.frameFps || 0} fps. Left: live camera with overlay. Right: last analyzed frame sent to backend.</div>
          <div className="text-[11px] text-text-muted mb-2">Microphone status: <span className="font-mono text-text-primary">{micStatus}</span></div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setVisualMode('composite')}
              className={`text-[11px] px-2 py-1 rounded border ${visualMode === 'composite' ? 'border-pulse/50 bg-pulse/10 text-pulse' : 'border-border text-text-muted'}`}
            >
              Composite
            </button>
            <button
              onClick={() => setVisualMode('landmarks')}
              className={`text-[11px] px-2 py-1 rounded border ${visualMode === 'landmarks' ? 'border-pulse/50 bg-pulse/10 text-pulse' : 'border-border text-text-muted'}`}
            >
              Landmarks only
            </button>
            <button
              onClick={() => setVisualMode('full')}
              className={`text-[11px] px-2 py-1 rounded border ${visualMode === 'full' ? 'border-pulse/50 bg-pulse/10 text-pulse' : 'border-border text-text-muted'}`}
            >
              Full Analysis overlay
            </button>
            <button
              onClick={() => setVisualMode('raw')}
              className={`text-[11px] px-2 py-1 rounded border ${visualMode === 'raw' ? 'border-pulse/50 bg-pulse/10 text-pulse' : 'border-border text-text-muted'}`}
            >
              Raw frame only
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-border bg-black/40 aspect-video relative">
                <video
                  ref={topPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-contain bg-black ${visualMode === 'landmarks' ? 'opacity-0' : 'opacity-100'}`}
                />
                {visualMode !== 'raw' && <FaceMonitorOverlay videoRef={topPreviewRef} metrics={metrics} drawVideoLayer={visualMode !== 'landmarks'} showHUD={visualMode === 'full'} />}
                
                {/* Vision AI Watching Tag Overlay - Bottom Center */}
                {metrics.faceDetected && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-blue-500/80 text-white text-[9px] font-semibold px-2.5 py-0.5 rounded-full shadow-md border border-blue-400 z-10 flex items-center gap-1.5 pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                    VISION AI WATCHING
                  </div>
                )}
              </div>

              <div className="rounded-lg overflow-hidden border border-border bg-black/40 aspect-video flex items-center justify-center relative">
                {monitoredFrame ? (
                  <>
                    <img src={monitoredFrame} alt="Last analyzed frame" className="w-full h-full object-cover opacity-60 bg-black" />
                    <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-emerald-400 z-10 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                      ANALYZED FRAME
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-text-muted">No analyzed frame yet</span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-text-muted uppercase tracking-wide">Practice controls</div>

              <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setMode(m.id); setResult(null); setTranscript('') }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      mode === m.id
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                        : 'border-border bg-surface/30 text-text-secondary hover:border-emerald-500/30'
                    }`}
                  >
                    <div className="text-lg mb-1">{m.icon}</div>
                    <div className="text-[11px] font-semibold leading-tight">{m.label}</div>
                    <div className="text-[10px] text-text-muted mt-1 leading-tight">{m.hint}</div>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={startModeTest}
                  disabled={!canStartMode}
                  className="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {mode === 'topic' ? 'Start Topic Test' : mode === 'repeat' ? 'Start Repeat Test' : 'Start Free Speech Test'}
                </button>
                <span className="text-[11px] text-text-muted">
                  {mode === 'topic'
                    ? 'Enter topic and tap Start Topic Test to begin.'
                    : mode === 'repeat'
                    ? 'Tap Start Repeat Test to get a reading prompt.'
                    : 'Tap Start Free Speech Test and speak on any topic you choose.'}
                </span>
              </div>

              {!canStartMode && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-200">
                  <div className="font-medium mb-1">Start button disabled because:</div>
                  <ul className="space-y-0.5">
                    {modeStartBlockers.map((reason, idx) => (
                      <li key={idx}>- {reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {canStartMode && controlsLocked && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-200">
                  Practice can start, but monitoring readiness is not fully green yet.
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted">Level:</span>
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all capitalize ${
                      level === l
                        ? 'border-pulse/50 bg-pulse/10 text-pulse'
                        : 'border-border text-text-muted hover:border-pulse/30'
                    }`}
                  >
                    {l}
                  </button>
                ))}
                <button
                  onClick={() => setSpeakFeedback((v) => !v)}
                  className={`text-xs px-3 py-1 rounded-full border transition-all ${
                    speakFeedback
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-border text-text-muted hover:border-emerald-500/30'
                  }`}
                >
                  {speakFeedback ? 'AI voice on' : 'AI voice off'}
                </button>
                <button
                  onClick={toggleMicrophone}
                  className={`text-xs px-3 py-1 rounded-full border transition-all ${
                    micEnabled
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-border text-text-muted hover:border-emerald-500/30'
                  }`}
                >
                  {micEnabled ? 'Disable Microphone' : 'Enable Microphone'}
                </button>
                <button
                  onClick={() => speakText(lastFeedbackSpeech || 'Voice test. I am your English coach.')}
                  className="text-xs px-3 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                >
                  Speak now
                </button>
                <button
                  onClick={() => setShowInspector((v) => !v)}
                  className={`text-xs px-3 py-1 rounded-full border transition-all ${
                    showInspector
                      ? 'border-pulse/50 bg-pulse/10 text-pulse'
                      : 'border-border text-text-muted hover:border-pulse/30'
                  }`}
                >
                  {showInspector ? 'Hide Inspector' : 'Monitoring Inspector'}
                </button>
              </div>

              {mode === 'repeat' && targetSentence && (
                <div className="bg-pulse/10 border border-pulse/30 rounded-xl p-3">
                  <div className="text-xs text-pulse font-medium mb-2 uppercase tracking-wide">📖 Read this aloud:</div>
                  <p className="text-sm font-medium text-text-primary leading-relaxed">"{targetSentence}"</p>
                  <button
                    onClick={fetchSentence}
                    className="mt-2 text-xs text-text-muted hover:text-pulse transition-colors"
                  >
                    ↻ New sentence
                  </button>
                </div>
              )}

              {mode === 'repeat' && (
                <div className="bg-surface/50 border border-border rounded-xl p-3">
                  <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Your reading text (editable)</div>
                  <textarea
                    value={targetSentence}
                    onChange={(e) => setTargetSentence(e.target.value)}
                    rows={4}
                    className="w-full bg-surface/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-pulse/50"
                    placeholder="Type or paste your own text to read..."
                  />
                </div>
              )}

              {mode === 'topic' && (
                <div className="bg-surface/50 border border-border rounded-xl p-3">
                  <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Topic setup</div>
                  <input
                    type="text"
                    value={topicPrompt}
                    onChange={(e) => setTopicPrompt(e.target.value)}
                    placeholder="Enter topic (e.g., climate change, startup pitch, machine learning)"
                    className="w-full bg-surface/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-pulse/50"
                  />
                  <p className="text-[11px] text-text-muted mt-2">In Topic Chat, your topic is injected into Groq analysis so feedback stays on your selected subject.</p>
                </div>
              )}

              {activeFollowUp && (
                <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-xl p-3">
                  <div className="text-xs text-cyan-300 font-medium mb-1 uppercase tracking-wide">Current follow-up question</div>
                  <p className="text-sm text-text-primary leading-relaxed">{activeFollowUp}</p>
                  <p className="text-[11px] text-text-secondary mt-2">Tap Speak and answer this directly. Previous coach output stays visible while you answer.</p>
                </div>
              )}

              <div className="bg-surface/50 border border-border rounded-xl p-3">
                <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Live pronunciation and mouth monitor</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/30 rounded px-2 py-1.5">Articulation <span className="font-mono text-text-primary">{pronunciationLive.articulation}/100</span></div>
                  <div className="bg-muted/30 rounded px-2 py-1.5">Delivery <span className="font-mono text-text-primary">{pronunciationLive.delivery}</span></div>
                  <div className="bg-muted/30 rounded px-2 py-1.5">Mouth open <span className="font-mono text-text-primary">{pronunciationLive.mouthOpen.toFixed(3)}</span></div>
                  <div className="bg-muted/30 rounded px-2 py-1.5">Mouth move <span className="font-mono text-text-primary">{pronunciationLive.mouthMove.toFixed(3)}</span></div>
                  <div className="bg-muted/30 rounded px-2 py-1.5">Tongue score <span className="font-mono text-text-primary">{pronunciationLive.tongue.toFixed(2)}</span></div>
                  <div className="bg-muted/30 rounded px-2 py-1.5">Speaking <span className="font-mono text-text-primary">{metrics.speakingDetected ? 'yes' : 'no'}</span></div>
                </div>
              </div>

              <div className="text-center py-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={isListening ? stopListening : startListening}
                  disabled={loading || controlsLocked}
                  className={`w-20 h-20 rounded-full text-3xl font-bold shadow-xl transition-all duration-300 border-4 ${
                    isListening
                      ? 'bg-crimson/20 border-crimson text-crimson animate-pulse'
                      : 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500'
                  } ${(loading || controlsLocked) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isListening ? '⏹' : '🎙'}
                </motion.button>
                <p className="text-xs text-text-muted mt-2">
                  {isListening ? 'Listening… tap to stop' : loading ? 'Analyzing…' : controlsLocked ? 'Waiting for readiness (green)' : (activeFollowUp ? 'Tap to answer follow-up question' : 'Tap to speak')}
                </p>
              </div>

              {(transcript || interimText) && (
                <div className="bg-surface/50 border border-border rounded-xl px-3 py-2 text-sm text-center">
                  <span className="text-text-primary">{transcript}</span>
                  <span className="text-text-muted italic">{interimText}</span>
                </div>
              )}

              {pendingConfirm && (
                <div className="bg-surface/50 border border-cyan-500/25 rounded-xl p-3">
                  <div className="text-xs text-cyan-300 uppercase tracking-wide mb-2">Confirm transcript before analysis</div>
                  <textarea
                    value={editableTranscript}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    rows={3}
                    className="w-full bg-surface/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-cyan-500/40"
                    placeholder="Edit your spoken text before analysis..."
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={confirmAndAnalyze}
                      className="text-xs px-3 py-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    >
                      Confirm & Analyze
                    </button>
                    <button
                      onClick={discardTranscript}
                      className="text-xs px-3 py-1.5 rounded border border-border text-text-muted hover:border-amber-500/30"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-surface/50 border border-border rounded-xl p-3">
                <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Recorded answer analysis (latest)</div>
                {lastRecordedVideoUrl ? (
                  <video controls src={lastRecordedVideoUrl} className="w-full mb-2 rounded-lg border border-border/50 bg-black/40" />
                ) : null}
                {lastRecordedAudioUrl ? (
                  <audio controls src={lastRecordedAudioUrl} className="w-full mb-2" />
                ) : (
                  <div className="text-[11px] text-text-muted mb-2">No recorded answer yet. Speak once to create recording.</div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/30 rounded px-2 py-1.5">Duration <span className="font-mono text-text-primary">{lastAudioFeatures?.duration_sec ?? '--'}s</span></div>
                  <div className="bg-muted/30 rounded px-2 py-1.5">Speech rate <span className="font-mono text-text-primary">{lastAudioFeatures?.speech_rate_wpm ?? '--'} wpm</span></div>
                  <div className="bg-muted/30 rounded px-2 py-1.5">Avg volume <span className="font-mono text-text-primary">{lastAudioFeatures?.avg_volume_rms ?? '--'}</span></div>
                  <div className="bg-muted/30 rounded px-2 py-1.5">Pause ratio <span className="font-mono text-text-primary">{lastAudioFeatures?.pause_ratio ?? '--'}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 xl:sticky xl:top-24 self-start">
        <div className="bg-surface/50 border border-border rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-text-muted uppercase tracking-wide font-medium">Latest coach output</div>
            {newOutputBadge && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">New output</span>}
          </div>
          {!!(result?.how_you_should_say_it || lastGroqResponseSummary?.how_you_should_say_it) && (
            <div className="mt-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
              <div className="text-[11px] text-indigo-300 mb-1">AI suggested answer (text + voice)</div>
              <div className="text-xs text-text-primary leading-relaxed mb-2">{result?.how_you_should_say_it || lastGroqResponseSummary?.how_you_should_say_it}</div>
              <button
                onClick={speakSuggestion}
                className="text-xs px-2.5 py-1 rounded border border-indigo-400/35 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20"
              >
                Play Suggestion Voice
              </button>
            </div>
          )}
          {result ? (
            <div className="mt-2">
              <FeedbackCard result={result} transcript={transcript} coachSpeech={lastFeedbackSpeech} />
            </div>
          ) : (
            <div className="mt-2 text-xs text-text-muted">No coach output yet. Start speaking or wait for AI opening prompt.</div>
          )}
        </div>

        {showAiCommunication && (
        <div className="bg-surface/50 border border-border rounded-xl p-3">
          <div className="text-xs text-text-muted uppercase tracking-wide font-medium">AI communication flow</div>

            <div className="mt-3">
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div className="bg-muted/30 rounded px-2 py-1.5">
                  <div className="text-text-muted mb-1">What AI monitors</div>
                  <div className="text-text-primary">Face {effectiveFaceDetected ? 'detected' : 'not detected'} · Gaze {effectiveGazeDirection} · FPS {metrics.frameFps || 0} · Mouth {Number(metrics.mouthOpenRatio || 0).toFixed(2)}</div>
                </div>
                <div className="bg-muted/30 rounded px-2 py-1.5">
                  <div className="text-text-muted mb-1">Audio output (coach speech)</div>
                  <div className="text-text-primary line-clamp-3">{agentSpeechLive || 'No AI speech yet'}</div>
                </div>
                <div className="bg-muted/30 rounded px-2 py-1.5">
                  <div className="text-text-muted mb-1">Audio input (learner speech)</div>
                  <div className="text-text-primary line-clamp-3">{learnerSpeechLive || 'No user speech yet'}</div>
                </div>
                <div className="bg-muted/30 rounded px-2 py-1.5">
                  <div className="text-text-muted mb-1">Groq + monitoring communication</div>
                  <div className="text-text-primary">Transcript + frame metrics are combined into one request; Groq returns coaching feedback used for voice + UI response.</div>
                </div>
                <div className="bg-muted/30 rounded px-2 py-1.5">
                  <div className="text-text-muted mb-1">Stream usage and vision transport</div>
                  <div className="text-text-primary">Stream session: {streamUsage.streamSession} ({streamUsage.streamTransport}). Vision path: {streamUsage.visionTransport}. Note: {streamUsage.visionMode}.</div>
                </div>
                <div className="bg-muted/30 rounded px-2 py-1.5 border border-amber-500/20">
                  <div className="text-text-muted mb-1">Why "No face detected" now</div>
                  <ul className="space-y-1 text-text-primary">
                    {noFaceReasons.map((reason, idx) => (
                      <li key={idx}>- {reason}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-muted/30 rounded px-2 py-1.5 border border-border/40">
                  <div className="text-text-muted mb-1">Vision SDK input and output (live)</div>
                  <div className="grid grid-cols-1 gap-1 font-mono text-[11px] text-text-primary">
                    <div>input.camera: {cameraEnabled ? 'on' : 'off'}</div>
                    <div>input.frame_fps: {metrics.frameFps || 0}</div>
                    <div>input.landmarks: {effectiveFaceDetected ? 'detected' : 'not-detected'}</div>
                    <div>input.real_mediapipe_landmarks: {metrics.mpLandmarksOn ? 'ON' : 'OFF'}</div>
                    <div>output.face_detected: {effectiveFaceDetected ? 'true' : 'false'}</div>
                    <div>output.gaze_on_screen: {metrics.gazeOnScreen ? 'true' : 'false'}</div>
                    <div>output.gaze_direction: {effectiveGazeDirection}</div>
                    <div>output.head_yaw: {Number(metrics.headYaw || 0).toFixed(1)}</div>
                    <div>output.head_pitch: {Number(metrics.headPitch || 0).toFixed(1)}</div>
                    <div>output.nodding_likely: {metrics.noddingLikely ? 'true' : 'false'}</div>
                    <div>output.mouth_open_ratio: {Number(metrics.mouthOpenRatio || 0).toFixed(3)}</div>
                    <div>output.speaking_detected: {metrics.speakingDetected ? 'true' : 'false'}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                <div className="bg-muted/30 rounded px-2 py-1.5 border border-border/40">
                  <div className="text-text-muted mb-1">Last vision metrics sent to Groq</div>
                  <pre className="text-[11px] text-text-primary font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {JSON.stringify(lastVisionPayload ?? { note: 'No request yet' }, null, 2)}
                  </pre>
                </div>
                <div className="bg-muted/30 rounded px-2 py-1.5 border border-border/40">
                  <div className="text-text-muted mb-1">Last transcript payload sent</div>
                  <pre className="text-[11px] text-text-primary font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {JSON.stringify(lastTranscriptPayload ?? { note: 'No request yet' }, null, 2)}
                  </pre>
                </div>
                <div className="bg-muted/30 rounded px-2 py-1.5 border border-border/40">
                  <div className="text-text-muted mb-1">Last Groq response summary</div>
                  <pre className="text-[11px] text-text-primary font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {JSON.stringify(lastGroqResponseSummary ?? { note: 'No response yet' }, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
        </div>
        )}

        <div className="bg-surface/50 border border-border rounded-xl p-3">
          <div className="text-xs text-text-muted uppercase tracking-wide font-medium">Past recorded analyses</div>
          {recordArchive.length === 0 ? (
            <div className="mt-2 text-xs text-text-muted">No past record analysis yet. Your spoken answers will appear here with playback and score.</div>
          ) : (
            <div className="mt-2 space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {recordArchive
                .filter((item) => item.tone !== 'ai') // Filter out old AI-only entries
                .map((item) => (
                <div key={item.id} className="bg-muted/20 border border-border/50 rounded-lg p-2 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-text-primary font-medium">Score {item.score ?? '--'}</span>
                    <span className="text-text-muted font-mono">{new Date(item.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-text-secondary mb-1 line-clamp-2">"{item.transcript}"</div>
                  {(item.video_data_url || item.analysis_video_data_url) && (
                    <div className="grid grid-cols-2 gap-2 mb-1">
                      {item.video_data_url && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-text-muted">Raw Camera</span>
                          <video controls src={item.video_data_url} className="w-full rounded border border-border/50 bg-black/40" />
                        </div>
                      )}
                      {item.analysis_video_data_url && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-text-muted">Vision SDK Analysis</span>
                          <video controls src={item.analysis_video_data_url} className="w-full rounded border border-border/50 bg-black/40" />
                        </div>
                      )}
                    </div>
                  )}
                  {item.audio_data_url && !item.video_data_url && <audio controls src={item.audio_data_url} className="w-full mb-1" />}
                  {item.how_you_should_say_it && (
                    <button
                      onClick={() => speakText(item.how_you_should_say_it)}
                      className="w-full mb-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 rounded px-2 py-1 text-xs text-emerald-200 flex items-center justify-center gap-1"
                    >
                      🔊 Play AI Suggestion
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-1 mb-1">
                    <div className="bg-surface/60 rounded px-1.5 py-1">Rate <span className="font-mono text-text-primary">{item.audio_features?.speech_rate_wpm ?? '--'} wpm</span></div>
                    <div className="bg-surface/60 rounded px-1.5 py-1">Pause <span className="font-mono text-text-primary">{item.audio_features?.pause_ratio ?? '--'}</span></div>
                    <div className="bg-surface/60 rounded px-1.5 py-1">Duration <span className="font-mono text-text-primary">{item.audio_features?.duration_sec ?? '--'}s</span></div>
                    <div className="bg-surface/60 rounded px-1.5 py-1">Relation <span className="font-mono text-text-primary">{item.follow_up_relevance_score ?? '--'}/100</span></div>
                  </div>
                  {item.how_you_should_say_it && (
                    <div className="text-[11px] text-text-secondary"><span className="text-text-primary">Say it better:</span> {item.how_you_should_say_it}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        </div>

        {showInspector && (
          <div className="bg-surface/60 border border-border rounded-xl p-4 space-y-3 text-xs">
            <div className="font-mono uppercase tracking-wide text-text-muted">What is monitored and how</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/30 rounded px-2 py-1.5">Frame freshness: <span className="text-text-primary font-mono">{Number.isFinite(signalHealth.frameAgeMs) ? `${Math.round(signalHealth.frameAgeMs / 1000)}s` : '--'}</span></div>
              <div className="bg-muted/30 rounded px-2 py-1.5">Speech-video sync: <span className="text-text-primary font-mono">{signalHealth.speechSyncScore}%</span></div>
              <div className="bg-muted/30 rounded px-2 py-1.5">Mouth open: <span className="text-text-primary font-mono">{Number(metrics.mouthOpenRatio || 0).toFixed(2)}</span></div>
              <div className="bg-muted/30 rounded px-2 py-1.5">Tongue score: <span className="text-text-primary font-mono">{Number(metrics.tongueScore || 0).toFixed(2)}</span></div>
              <div className="bg-muted/30 rounded px-2 py-1.5">Speaking detected: <span className="text-text-primary">{metrics.speakingDetected ? 'yes' : 'no'}</span></div>
              <div className="bg-muted/30 rounded px-2 py-1.5">Model action: <span className="text-text-primary">Groq scores using live vision context</span></div>
            </div>
            <div className="text-text-secondary leading-relaxed">
              Pipeline: Browser camera frame to backend frame analysis to live monitoring state to Groq feedback prompt context.
              If frame freshness is stale or camera is not live, coaching analysis is blocked for quality.
            </div>
            <div className="rounded-lg overflow-hidden border border-border bg-black/40 aspect-video flex items-center justify-center">
              {monitoredFrame ? (
                <img src={monitoredFrame} alt="Inspector analyzed frame" className="w-full h-full object-contain bg-black" />
              ) : (
                <span className="text-xs text-text-muted">No analyzed frame in inspector yet</span>
              )}
            </div>
            <div className="bg-surface/50 border border-border rounded-lg p-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">Frame timeline scrub</div>
              <input
                type="range"
                min={0}
                max={Math.max(0, frameHistory.length - 1)}
                value={Math.min(frameCursor, Math.max(0, frameHistory.length - 1))}
                onChange={(e) => setFrameCursor(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-[11px] text-text-secondary mt-1">
                {frameHistory.length > 0
                  ? `Index ${frameCursor + 1}/${frameHistory.length} · hash ${frameHistory[frameCursor]?.hash || 'n/a'}`
                  : 'No frame history yet'}
              </div>
              <div className="rounded-md overflow-hidden border border-border mt-2 aspect-video bg-black/40 flex items-center justify-center">
                {frameHistory[frameCursor]?.src ? (
                  <img src={frameHistory[frameCursor].src} alt="Timeline frame" className="w-full h-full object-contain bg-black" />
                ) : (
                  <span className="text-[11px] text-text-muted">No frame selected</span>
                )}
              </div>
            </div>
            <div className="border border-border/50 rounded-lg p-2 bg-surface/40">
              <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">Raw event log</div>
              <div className="max-h-44 overflow-y-auto space-y-1">
                {eventLog.length === 0 ? (
                  <div className="text-[11px] text-text-muted">No events yet.</div>
                ) : (
                  eventLog.map((line, idx) => (
                    <div key={idx} className="text-[11px] font-mono text-text-secondary break-words">{line}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-crimson/10 border border-crimson/30 rounded-xl px-4 py-3 text-sm text-crimson text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 py-4"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="text-xs text-text-muted ml-1">Groq is analyzing your speech…</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual re-analyze */}
        {transcript && !loading && (
          <div className="text-center">
            <button
              onClick={() => {
                const cleaned = String(transcript || '').trim()
                setEditableTranscript(cleaned)
                setPendingConfirm(true)
              }}
              disabled={controlsLocked}
              className="text-xs text-text-muted hover:text-emerald-400 border border-border
                         hover:border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg transition-all"
            >
              Confirm/Re-analyze
            </button>
          </div>
        )}

        {/* Session history */}
        {history.length > 0 && (
          <div>
            <div className="text-xs text-text-muted uppercase tracking-wide font-medium mb-2">
              Session ({history.length} attempt{history.length > 1 ? 's' : ''})
            </div>
            <div className="bg-surface/40 border border-border rounded-xl px-3 py-1">
              {history.map((entry, i) => (
                <HistoryEntry key={i} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Right metrics panel: aligned with other learning modes */}
      <div className="w-[280px] flex-shrink-0 flex flex-col gap-3 p-4 border-l border-border overflow-y-auto">
        <div className="glass rounded-xl border border-border p-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">Single coach engine</div>
          <div className="text-sm text-text-primary">Algsoch Vision Realtime (default) + Hybrid fallback</div>
          <div className="text-xs text-text-muted mt-1">Default route is full vision-agent realtime coach; fallback route keeps Groq hybrid coaching active if realtime is unavailable.</div>
        </div>
        <MonitoringScopeCard
          title="Coach Monitoring"
          compact={false}
          onOpenInspector={() => setShowInspector(true)}
          engineLabel="groq"
          monitoredFrame={monitoredFrame}
          cameraEnabled={cameraEnabled}
          cameraStatus={cameraStatus}
          processingStatus={processingStatus}
        />
        <div className="grid grid-cols-2 gap-2">
          <EngagementMeter score={metrics.engagementScore} label="Engagement" compact />
          <EngagementMeter score={metrics.attentionScore} label="Attention" compact />
        </div>
        <CognitiveLoadIndicator score={metrics.cognitiveLoadScore} />
        <AttentionWaveform />
        <EyeTrackingPanel />
      </div>
      </div>
    </div>
  )
}
