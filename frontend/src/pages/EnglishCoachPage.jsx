/**
 * EnglishCoachPage — AI-powered English communication coach.
 * Listens to user speech, sends text to Groq LLaMA-3, receives
 * detailed feedback on grammar, clarity, and pronunciation hints.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../hooks/useSessionStore'
import { useBackendConnection } from '../hooks/useBackendConnection'
import { useWebcamAnalysis } from '../hooks/useWebcamAnalysis'
import AgentStatusBar from '../components/AgentStatusBar'
import AIAgentPanel from '../components/AIAgentPanel'
import EngagementMeter from '../components/EngagementMeter'
import CognitiveLoadIndicator from '../components/CognitiveLoadIndicator'
import AttentionWaveform from '../components/AttentionWaveform'
import EyeTrackingPanel from '../components/EyeTrackingPanel'
import InterventionFeed from '../components/InterventionFeed'
import FaceMonitorOverlay from '../components/FaceMonitorOverlay'
import MonitoringScopeCard from '../components/MonitoringScopeCard'

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8001`

// ── Groq API call ─────────────────────────────────────────────────────────────
async function analyzeWithGroq(transcript, mode = 'analyze', faceMetrics = null) {
  const res = await fetch(`${API_BASE}/api/english-coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, mode, face_metrics: faceMetrics }),
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
function FeedbackCard({ result, transcript }) {
  if (!result) return null
  const {
    score,
    corrections = [],
    grammar_notes = [],
    pronunciation_notes = [],
    delivery_notes = [],
    focus_feedback,
    action_plan = [],
    overall_feedback,
    improvement_tip,
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

      {focus_feedback && (
        <div className="bg-aurora/10 border border-aurora/20 rounded-lg px-3 py-2">
          <div className="text-xs text-aurora font-medium mb-1">👁 Vision & Focus</div>
          <p className="text-xs text-text-secondary leading-relaxed">{focus_feedback}</p>
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
  const addConversationEntry = useSessionStore((s) => s.addConversationEntry)
  const metrics = useSessionStore((s) => s.metrics)
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

  const recognitionRef = useRef(null)
  const previewRef = useRef(null)
  const bootRef = useRef(false)
  const micRetryRef = useRef(0)

  // Reuse existing real-time backend WS + webcam analyzer pipeline
  useBackendConnection()
  const { cameraStatus, cameraError, processingStatus, previewStream } = useWebcamAnalysis(cameraEnabled)

  useEffect(() => {
    if (!previewRef.current) return
    previewRef.current.srcObject = previewStream || null
  }, [previewStream])

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
      window.speechSynthesis?.cancel()
      setContentSource(null)
      setTopic('')
      endSession()
    }
  }, [endSession, setContentSource, setTopic])

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

  // ── Speech recognition ─────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Speech recognition not supported in this browser. Use Chrome or Edge.')
      return
    }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    setTranscript('')
    setInterimText('')
    setResult(null)
    setError('')
    setIsListening(true)
    micRetryRef.current = 0

    rec.onresult = (e) => {
      let interim = ''
      let final   = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      if (final)   setTranscript(final)
      if (interim) setInterimText(interim)
    }

    rec.onerror = (e) => {
      if (e.error === 'network' && micRetryRef.current < 2) {
        micRetryRef.current += 1
        setError('Microphone network glitch. Retrying...')
        setTimeout(() => {
          try { rec.start() } catch {}
        }, 800)
        return
      }
      setError(`Microphone error: ${e.error}. Please allow microphone access.`)
      setIsListening(false)
    }

    rec.onend = () => {
      setIsListening(false)
      setInterimText('')
      micRetryRef.current = 0
    }

    recognitionRef.current = rec
    rec.start()
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  // ── Analyze transcript ─────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    const text = transcript.trim()
    if (!text) { setError('No speech detected. Try again.'); return }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const analysisMode = mode === 'repeat' ? 'repeat' : mode === 'topic' ? 'topic' : 'analyze'
      const visionReady = cameraEnabled && cameraStatus === 'running' && processingStatus === 'processing' && (metrics.frameFps || 0) > 0
      setLearnerSpeech(text)
      addConversationEntry('user', text)
      const data = await analyzeWithGroq(text, analysisMode, {
        ...(visionReady ? {
          face_detected: metrics.faceDetected,
          gaze_on_screen: metrics.gazeOnScreen,
          gaze_direction: metrics.gazeDirection,
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
        } : {}),
      })
      setResult(data)
      const spokenFeedback = [data.overall_feedback, data.improvement_tip].filter(Boolean).join(' ')
      if (spokenFeedback) {
        setAgentTranscript(spokenFeedback)
        setAgentSpeech(spokenFeedback)
        addConversationEntry('ai', spokenFeedback, 'english_feedback')
        if (speakFeedback && window.speechSynthesis) {
          window.speechSynthesis.cancel()
          const u = new SpeechSynthesisUtterance(spokenFeedback.replace(/Algsoch/g, 'Alagsoch'))
          u.rate = 1.0
          u.pitch = 1.0
          window.speechSynthesis.speak(u)
        }
      }
      setSessionScore((prev) => [...prev, data.score ?? 70])
      setHistory((prev) => [{ transcript: text, result: data, ts: Date.now() }, ...prev].slice(0, 20))

      // Auto-generate next sentence if in repeat mode
      if (mode === 'repeat') fetchSentence()
    } catch (err) {
      setError('Analysis failed. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [
    transcript,
    mode,
    fetchSentence,
    cameraEnabled,
    cameraStatus,
    processingStatus,
    metrics,
    setLearnerSpeech,
    setAgentSpeech,
    setAgentTranscript,
    addConversationEntry,
    speakFeedback,
  ])

  // Auto-analyze when STT stops and we have a transcript
  useEffect(() => {
    if (!isListening && transcript && !result && !loading) handleAnalyze()
  }, [isListening, transcript])

  const avgScore = sessionScore.length
    ? Math.round(sessionScore.reduce((a, b) => a + b, 0) / sessionScore.length)
    : null

  const visionSdkStatus =
    !cameraEnabled ? 'camera-off' :
    !visionBootstrapped ? 'bootstrapping' :
    (cameraStatus === 'running' && processingStatus === 'processing') ? 'active' :
    (cameraStatus === 'running' && processingStatus === 'backend_offline') ? 'backend-offline' :
    (cameraStatus === 'denied') ? 'permission-denied' : 'starting'

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

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Mode selector */}
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
              <div className="text-xl mb-1">{m.icon}</div>
              <div className="text-xs font-semibold">{m.label}</div>
              <div className="text-xs text-text-muted mt-0.5 leading-tight">{m.hint}</div>
            </button>
          ))}
        </div>

        {/* Level */}
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
        </div>

        {/* Target sentence (repeat mode) */}
        <AnimatePresence>
          {mode === 'repeat' && targetSentence && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-pulse/10 border border-pulse/30 rounded-xl p-4"
            >
              <div className="text-xs text-pulse font-medium mb-2 uppercase tracking-wide">📖 Read this aloud:</div>
              <p className="text-base font-medium text-text-primary leading-relaxed">"{targetSentence}"</p>
              <button
                onClick={fetchSentence}
                className="mt-2 text-xs text-text-muted hover:text-pulse transition-colors"
              >
                ↻ New sentence
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Microphone area */}
        <div className="text-center py-6">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={isListening ? stopListening : startListening}
            disabled={loading}
            className={`w-24 h-24 rounded-full text-4xl font-bold shadow-xl transition-all duration-300 border-4 ${
              isListening
                ? 'bg-crimson/20 border-crimson text-crimson animate-pulse'
                : 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isListening ? '⏹' : '🎙'}
          </motion.button>
          <p className="text-xs text-text-muted mt-3">
            {isListening ? 'Listening… tap to stop' : loading ? 'Analyzing…' : 'Tap to speak'}
          </p>
        </div>

        {/* Live vision analysis status */}
        <div className="bg-surface/50 border border-border rounded-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs text-text-muted uppercase tracking-wide font-medium">Vision AI</div>
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

          {cameraEnabled && (
            <div className="mb-2 rounded-lg overflow-hidden border border-border bg-black/40 aspect-video relative">
              <video
                ref={previewRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <FaceMonitorOverlay videoRef={previewRef} metrics={metrics} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/30 rounded px-2 py-1.5">
              Face:{' '}
              <span className={
                !cameraEnabled ? 'text-text-muted' :
                metrics.faceDetected ? 'text-emerald-400' : 'text-crimson'
              }>
                {!cameraEnabled ? 'Camera off' : metrics.faceDetected ? 'Detected' : 'Not detected'}
              </span>
            </div>
            <div className="bg-muted/30 rounded px-2 py-1.5">FPS: <span className="text-pulse font-mono">{cameraEnabled ? (metrics.frameFps || 0) : 0}</span></div>
            <div className="bg-muted/30 rounded px-2 py-1.5">Gaze: <span className="text-text-primary capitalize">{cameraEnabled ? (metrics.gazeDirection || 'center') : 'off'}</span></div>
            <div className="bg-muted/30 rounded px-2 py-1.5">Movement: <span className="text-text-primary font-mono">{cameraEnabled ? Math.round((metrics.restlessness || 0) * 100) : 0}%</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
            <div className="bg-muted/30 rounded px-2 py-1.5">Frame Hash: <span className="text-pulse font-mono">{cameraEnabled ? (metrics.frameHash || '—') : '—'}</span></div>
            <div className="bg-muted/30 rounded px-2 py-1.5">People: <span className="text-text-primary font-mono">{cameraEnabled ? (metrics.peopleCount ?? 0) : 0}</span></div>
            <div className="bg-muted/30 rounded px-2 py-1.5">Blink/min: <span className="text-text-primary font-mono">{cameraEnabled ? Number(metrics.blinkRate || 0).toFixed(1) : '0.0'}</span></div>
            <div className="bg-muted/30 rounded px-2 py-1.5">Focus: <span className="text-text-primary font-mono">{cameraEnabled ? Math.round(metrics.focusDuration || 0) : 0}s</span></div>
          </div>

          <div className="mt-2 text-[11px] rounded border border-border/40 bg-surface/30 px-2 py-1.5">
            Vision SDK Status:{' '}
            <span className={
              visionSdkStatus === 'active' ? 'text-emerald-400 font-semibold' :
              visionSdkStatus === 'backend-offline' || visionSdkStatus === 'permission-denied' ? 'text-crimson font-semibold' :
              'text-amber-400 font-semibold'
            }>
              {visionSdkStatus}
            </span>
          </div>
          {!cameraEnabled ? (
            <p className="text-[11px] text-text-muted mt-2">
              Camera is off. Turn it on to include face, gaze, and movement in feedback.
            </p>
          ) : cameraStatus === 'requesting' ? (
            <p className="text-[11px] text-amber-400 mt-2">Waiting for camera permission…</p>
          ) : cameraStatus === 'denied' ? (
            <p className="text-[11px] text-crimson mt-2">Camera permission denied. Allow camera in browser settings and click Enable Camera again.</p>
          ) : !visionBootstrapped ? (
            <p className="text-[11px] text-amber-400 mt-2">Preparing Vision Agents session… {visionBootError ? `(${visionBootError})` : ''}</p>
          ) : cameraStatus === 'running' && processingStatus === 'backend_offline' ? (
            <p className="text-[11px] text-crimson mt-2">Camera opened, but Vision SDK processor is not ready. Keep backend running and retry Enable Camera.</p>
          ) : cameraStatus === 'running' && processingStatus === 'processing' ? (
            <p className="text-[11px] text-emerald-400 mt-2">Live vision active. Feedback includes face + gaze + movement.</p>
          ) : (
            <p className="text-[11px] text-text-muted mt-2">{cameraError || 'Starting camera...'}</p>
          )}
        </div>

        {/* Live transcript */}
        <AnimatePresence>
          {(transcript || interimText) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-surface/50 border border-border rounded-xl px-4 py-3 text-sm text-center"
            >
              <span className="text-text-primary">{transcript}</span>
              <span className="text-text-muted italic">{interimText}</span>
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* Feedback */}
        <FeedbackCard result={result} transcript={transcript} />

        {/* Manual re-analyze */}
        {transcript && !loading && (
          <div className="text-center">
            <button
              onClick={handleAnalyze}
              className="text-xs text-text-muted hover:text-emerald-400 border border-border
                         hover:border-emerald-500/30 px-4 py-1.5 rounded-lg transition-all"
            >
              ↻ Re-analyze
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
        <AIAgentPanel />
        <MonitoringScopeCard title="Coach Monitoring" compact={false} />
        <div className="grid grid-cols-2 gap-2">
          <EngagementMeter score={metrics.engagementScore} label="Engagement" compact />
          <EngagementMeter score={metrics.attentionScore} label="Attention" compact />
        </div>
        <CognitiveLoadIndicator score={metrics.cognitiveLoadScore} />
        <AttentionWaveform />
        <EyeTrackingPanel />
        <InterventionFeed />
      </div>
      </div>
    </div>
  )
}
