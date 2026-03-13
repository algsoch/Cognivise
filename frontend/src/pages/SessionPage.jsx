/**
 * SessionPage — main learning session interface.
 *
 * Lecture panel  → YouTube embed | local video | screen share | placeholder
 * Learner panel  → real webcam via getUserMedia
 * Sidebar        → all live metrics
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../hooks/useSessionStore'
import { useHistoryStore } from '../hooks/useHistoryStore'
import AgentStatusBar from '../components/AgentStatusBar'
import EngagementMeter from '../components/EngagementMeter'
import AttentionWaveform from '../components/AttentionWaveform'
import CognitiveLoadIndicator from '../components/CognitiveLoadIndicator'
import MasteryTracker from '../components/MasteryTracker'
import InterventionFeed from '../components/InterventionFeed'
import FaceMonitorOverlay from '../components/FaceMonitorOverlay'
import AIAgentPanel from '../components/AIAgentPanel'
import EyeTrackingPanel from '../components/EyeTrackingPanel'
import LatencyGraph from '../components/LatencyGraph'
import MonitoringScopeCard from '../components/MonitoringScopeCard'
import { useBackendConnection } from '../hooks/useBackendConnection'
import { useStreamAudio } from '../hooks/useStreamAudio'
import { useWebcamAnalysis } from '../hooks/useWebcamAnalysis'
import { useBrowserSTT } from '../hooks/useBrowserSTT'
import { useVideoProgress } from '../hooks/useVideoProgress'
import VideoProgressGraph from '../components/VideoProgressGraph'

// ── AI Chat Content (used when mode = 'ai_chat') ────────────────────────────
function AIChatContent({ label }) {
  const conversationLog      = useSessionStore((s) => s.conversationLog)
  const agentSpeech          = useSessionStore((s) => s.agentSpeech)
  const sendMessage          = useSessionStore((s) => s.sendMessage)
  const addConversationEntry = useSessionStore((s) => s.addConversationEntry)
  const [inputText, setInputText]  = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!agentSpeech) return
    setIsSpeaking(true)
    const t = setTimeout(() => setIsSpeaking(false), 7000)
    return () => clearTimeout(t)
  }, [agentSpeech])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [conversationLog.length])

  const handleSend = () => {
    const text = inputText.trim()
    if (!text || !sendMessage) return
    sendMessage(text)
    addConversationEntry('user', text)
    setInputText('')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface/30 rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-surface/60 flex-shrink-0">
        <motion.div
          animate={{ scale: isSpeaking ? [1, 1.15, 1] : 1 }}
          transition={{ duration: 0.6, repeat: isSpeaking ? Infinity : 0 }}
          className="w-9 h-9 rounded-xl bg-pulse flex items-center justify-center shadow-glow flex-shrink-0"
        >
          <span className="text-[18px]">🤖</span>
        </motion.div>
        <div>
          <p className="text-sm font-semibold text-text-primary leading-none mb-0.5">Algsoch · AI Tutor</p>
          <p className="text-[11px] text-text-muted font-mono">
            {label && label !== 'AI Tutor Chat' ? `Topic: ${label}` : 'Ask me anything — I\'ll teach and adapt to you'}
          </p>
        </div>
        {isSpeaking && (
          <div className="ml-auto flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.span key={i}
                animate={{ scaleY: [0.4, 1, 0.4] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                className="inline-block w-1 bg-pulse rounded-full"
                style={{ height: 18 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 p-4 space-y-3 overflow-y-auto min-h-0">
        {conversationLog.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-text-muted py-8">
            <span className="text-4xl">💬</span>
            <p className="text-sm font-medium text-text-secondary">
              {label && label !== 'AI Tutor Chat' ? `Ready to teach you about ${label}` : 'Ready to teach!'}<br/>
              <span className="text-xs text-text-muted font-normal">Say something or type below — I'm listening and watching</span>
            </p>
          </div>
        )}
        {conversationLog.map((entry, i) => (
          <div key={i} className={`flex gap-2.5 ${entry.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <span className="flex-shrink-0 text-[18px] mt-0.5">
              {entry.role === 'ai' ? '🤖' : '👤'}
            </span>
            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              entry.role === 'ai'
                ? 'bg-pulse/10 border border-pulse/20 text-text-primary rounded-tl-none'
                : 'bg-aurora/10 border border-aurora/20 text-text-primary rounded-tr-none'
            }`}>
              {entry.action && (
                <span className="block text-[9px] font-mono uppercase tracking-wider mb-1 opacity-60">
                  {entry.action.replace(/_/g, ' ')}
                </span>
              )}
              {entry.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border/40 flex gap-2 flex-shrink-0 bg-surface/60">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Type your answer or question…"
          className="flex-1 bg-surface/60 border border-border/40 rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-pulse/50"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="flex-shrink-0 bg-pulse hover:bg-pulse/90 disabled:opacity-30 rounded-xl px-4 py-2.5 text-sm text-white font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Lecture panel content ────────────────────────────────────────────────────
function LectureContent({ contentSource, screenStream, contentRef, isSpeaking, startScreenShare }) {
  const localVideoRef = useRef(null)

  // Attach screen share stream to <video>
  useEffect(() => {
    if (contentSource?.type === 'screenshare' && screenStream && localVideoRef.current) {
      localVideoRef.current.srcObject = screenStream
      if (contentRef) contentRef.current = localVideoRef.current
    }
  }, [contentSource, screenStream])

  // Volume duck: lower uploaded/screenshare video when AI is speaking
  useEffect(() => {
    const el = contentRef?.current
    if (!el) return
    if (el.tagName === 'VIDEO') {
      el.volume = isSpeaking ? 0.12 : 1.0
    } else if (el.tagName === 'IFRAME') {
      // YouTube postMessage volume control (requires enablejsapi=1 in URL)
      try {
        el.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'setVolume', args: [isSpeaking ? 8 : 100] }),
          '*'
        )
      } catch {}
    }
  }, [isSpeaking])

  if (!contentSource) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
        <span className="text-5xl">📺</span>
        <p className="text-sm font-medium">No content selected</p>
        <p className="text-xs text-text-muted">Agent is monitoring via voice & camera only</p>
      </div>
    )
  }

  if (contentSource.type === 'youtube') {
    return (
      <iframe
        ref={(el) => { if (contentRef) contentRef.current = el }}
        src={contentSource.url}
        className="w-full h-full rounded-lg"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Lecture video"
      />
    )
  }

  if (contentSource.type === 'upload') {
    return (
      <video
        ref={(el) => { if (contentRef) contentRef.current = el }}
        src={contentSource.url}
        controls
        className="w-full h-full rounded-lg object-contain bg-black"
      />
    )
  }

  if (contentSource.type === 'ai_chat') {
    return (
      <AIChatContent label={contentSource.label} />
    )
  }

  if (contentSource.type === 'screenshare') {
    if (screenStream) {
      return (
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full rounded-lg object-contain bg-black"
        />
      )
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-text-muted">
        <span className="text-6xl">🖥</span>
        <div className="text-center">
          <p className="text-base font-medium text-text-primary mb-1">Screen Share</p>
          <p className="text-sm text-text-muted mb-4">
            Click below to choose a window or tab to share.<br />
            Algsoch will watch what you study and ask questions about it.
          </p>
          <button
            onClick={startScreenShare}
            className="btn-primary px-6 py-2.5 text-sm"
          >
            🖥 Start Screen Share
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ── Learner webcam panel ─────────────────────────────────────────────────────
function LearnerCam({ userName, metrics, learnerSpeech }) {
  const videoRef  = useRef(null)
  const [camOn, setCamOn]   = useState(true)
  const [isTyping, setIsTyping] = useState(false)
  const streamRef   = useRef(null)
  const typingTimer = useRef(null)

  // Auto-hide speech bubble after 5s so it doesn't stick forever
  const [displaySpeech, setDisplaySpeech] = useState('')
  const speechClearRef = useRef(null)
  useEffect(() => {
    if (!learnerSpeech) return
    setDisplaySpeech(learnerSpeech)
    clearTimeout(speechClearRef.current)
    speechClearRef.current = setTimeout(() => setDisplaySpeech(''), 5000)
    return () => clearTimeout(speechClearRef.current)
  }, [learnerSpeech])

  useEffect(() => {
    let mounted = true
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => {})
    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    const onKey = () => {
      setIsTyping(true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => setIsTyping(false), 1500)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(typingTimer.current)
    }
  }, [])

  const toggleCam = useCallback(() => {
    setCamOn((prev) => {
      const next = !prev
      streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next })
      return next
    })
  }, [])

  return (
    <div className="w-full glass rounded-xl overflow-hidden relative flex flex-col flex-shrink-0">
      {/* Video — 16:9 to maximize face visibility */}
      <div className="relative bg-black" style={{ aspectRatio: '16/11' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`absolute inset-0 w-full h-full object-cover bg-black ${camOn ? '' : 'hidden'}`}
        />
        {camOn && <FaceMonitorOverlay videoRef={videoRef} metrics={metrics} isTyping={isTyping} />}
        {!camOn && (
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
            <span className="text-3xl">👤</span>
            <span className="text-xs text-text-muted">Camera off</span>
          </div>
        )}

        {/* Learner speech overlay — live confirmation AI is hearing you */}
        <AnimatePresence>
          {displaySpeech && (
            <motion.div
              key={displaySpeech}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-1.5 inset-x-1.5 bg-black/75 backdrop-blur-sm
                         rounded-lg px-2.5 py-1.5 z-10 border border-aurora/30"
            >
              <p className="text-[10px] text-aurora/90 font-mono truncate">
                💬 {displaySpeech}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Name strip + cam toggle */}
      <div className="px-3 py-1.5 flex items-center justify-between bg-surface/60">
        <span className="text-xs font-medium text-text-primary truncate max-w-[110px]">{userName}</span>
        <button onClick={toggleCam}
          className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors
          ${camOn ? 'bg-pulse/20 text-pulse hover:bg-pulse/30' : 'bg-crimson/20 text-crimson hover:bg-crimson/30'}`}>
          {camOn ? '📹' : '📷✗'}
        </button>
      </div>
    </div>
  )
}

// ── Screen mini live preview (for screenshare in AI panel) ──────────────────
function ScreenMiniPreview({ stream }) {
  const previewRef = useRef(null)
  useEffect(() => {
    if (previewRef.current && stream) previewRef.current.srcObject = stream
  }, [stream])
  return (
    <video
      ref={previewRef}
      autoPlay
      muted
      className="w-full rounded-md object-contain bg-black"
      style={{ maxHeight: '75px' }}
    />
  )
}

// ── Q&A Conversation log (below learner cam) ─────────────────────────────────
function ConversationLog() {
  const conversationLog      = useSessionStore((s) => s.conversationLog)
  const sendMessage          = useSessionStore((s) => s.sendMessage)
  const addConversationEntry = useSessionStore((s) => s.addConversationEntry)
  const scrollRef = useRef(null)
  const [inputText, setInputText] = useState('')

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [conversationLog.length])

  const handleSend = () => {
    const text = inputText.trim()
    if (!text) return
    if (sendMessage) sendMessage(text)
    addConversationEntry('user', text)
    setInputText('')
  }

  return (
    <div className="glass rounded-xl overflow-hidden flex-shrink-0">
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
          💬 Q&amp;A Log
        </span>
        {conversationLog.length > 0 && (
          <span className="text-[9px] font-mono ml-auto bg-pulse/10 text-pulse/80 px-1.5 py-0.5 rounded-full">
            {conversationLog.length}
          </span>
        )}
      </div>
      <div ref={scrollRef} className="p-2 space-y-1.5 max-h-[185px] overflow-y-auto">
        {conversationLog.length === 0 ? (
          <p className="text-[10px] text-text-muted text-center py-3 font-mono italic">
            Conversation will appear here…
          </p>
        ) : (
          conversationLog.map((entry, i) => (
            <div
              key={i}
              className={`flex gap-1.5 ${entry.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <span className="flex-shrink-0 text-[13px] mt-0.5">
                {entry.role === 'ai' ? '🤖' : '👤'}
              </span>
              <div
                className={`max-w-[88%] rounded-xl px-2.5 py-1.5 border text-[10px] leading-relaxed ${
                  entry.role === 'ai'
                    ? 'bg-pulse/10 border-pulse/20 text-text-primary rounded-tl-none'
                    : 'bg-aurora/10 border-aurora/20 text-text-primary rounded-tr-none'
                }`}
              >
                {entry.action && (
                  <span className="block text-[8px] font-mono uppercase tracking-wider mb-0.5 text-pulse/60">
                    {entry.action.replace(/_/g, ' ')}
                  </span>
                )}
                {entry.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Typed reply input ─────────────────────────────────────── */}
      <div className="border-t border-border/30 p-2 flex gap-1.5">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Type a reply…"
          className="flex-1 bg-surface/60 border border-border/40 rounded-lg px-2.5 py-1.5 text-[11px] text-text-primary placeholder-text-muted focus:outline-none focus:border-pulse/50 min-w-0"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="flex-shrink-0 bg-pulse/20 hover:bg-pulse/30 disabled:opacity-30 border border-pulse/30 rounded-lg px-2.5 py-1.5 text-[11px] text-pulse transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── AI Agent Activity Panel (below learner cam) ──────────────────────────────
const ACTION_EMOJI = {
  ask_question:        '❓',
  simplify:            '💡',
  break_down:          '🔍',
  check_in:            '🙋',
  active_recall:       '🧠',
  increase_difficulty: '⬆️',
  motivate:            '⭐',
  greeting:            '👋',
  speaking:            '🔊',
}

function SpeechBubble({ text, isActive, color = 'pulse', label, icon, side = 'left' }) {
  if (!text) return null
  return (
    <motion.div
      animate={{ opacity: isActive ? 1 : 0.5 }}
      transition={{ duration: 0.8 }}
      className="mb-2"
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[9px]">{icon}</span>
        <span className={`text-[9px] font-mono uppercase tracking-widest text-${color}/70`}>
          {label}
        </span>
        {isActive && (
          <span className={`inline-block w-1 h-1 rounded-full bg-${color} animate-pulse ml-0.5`} />
        )}
      </div>
      <div className={`bg-surface/70 border border-${color === 'pulse' ? 'pulse' : 'aurora'}/20
                       rounded-lg px-2.5 py-1.5 ${side === 'right' ? 'ml-4' : 'mr-4'}`}>
        <p className="text-[11px] text-text-primary leading-relaxed line-clamp-3 italic">
          &ldquo;{text}&rdquo;
        </p>
      </div>
    </motion.div>
  )
}

function AgentActivityPanel() {
  const agentSpeech   = useSessionStore((s) => s.agentSpeech)
  const agentAction   = useSessionStore((s) => s.agentAction)
  const agentStatus   = useSessionStore((s) => s.agentStatus)
  const interventions = useSessionStore((s) => s.interventions)
  const learnerSpeech = useSessionStore((s) => s.learnerSpeech)
  const contentSource = useSessionStore((s) => s.contentSource)
  const screenStream  = useSessionStore((s) => s.screenStream)

  // Extract YouTube video ID for thumbnail preview
  const ytId = contentSource?.type === 'youtube'
    ? (contentSource.url?.match(/embed\/([^?&/]+)/)?.[1] ?? null)
    : null

  const [isSpeaking, setIsSpeaking]    = useState(false)
  const [fadedSpeech, setFadedSpeech]  = useState('')
  const [fadedLearner, setFadedLearner] = useState('')
  const learnerFadeRef = useRef(null)

  // Track last agent speech with 7s active window
  useEffect(() => {
    if (!agentSpeech) return
    setFadedSpeech(agentSpeech)
    setIsSpeaking(true)
    const t = setTimeout(() => setIsSpeaking(false), 7000)
    return () => clearTimeout(t)
  }, [agentSpeech])

  // Track last learner speech with 10s active window
  useEffect(() => {
    if (!learnerSpeech) return
    setFadedLearner(learnerSpeech)
    clearTimeout(learnerFadeRef.current)
    learnerFadeRef.current = setTimeout(() => setFadedLearner(''), 10000)
    return () => clearTimeout(learnerFadeRef.current)
  }, [learnerSpeech])

  // Resolve action type safely (never show raw null/undefined)
  const rawType     = agentAction?.type ?? null
  const currentType = isSpeaking ? (rawType ?? 'speaking') : rawType
  const emoji       = (currentType && ACTION_EMOJI[currentType]) ? ACTION_EMOJI[currentType] : '🤖'
  const actionLabel = currentType
    ? currentType.replace(/_/g, ' ')
    : agentStatus === 'connected' ? 'monitoring' : agentStatus ?? 'disconnected'

  // What the AI is looking at
  const seenLabel =
    contentSource?.type === 'youtube'     ? '▶ YouTube video' :
    contentSource?.type === 'upload'      ? `📁 ${contentSource.label ?? 'uploaded video'}` :
    contentSource?.type === 'screenshare' ? '🖥 your screen' :
    contentSource?.type === 'ai_chat'     ? '💬 conversation' :
    '🎙 voice & camera only'

  // Action topic — never show raw "null" or "none"
  const actionTopic = (agentAction?.topic && agentAction.topic !== 'null' && agentAction.topic !== 'none')
    ? agentAction.topic
    : null

  return (
    <motion.div
      animate={{
        borderColor: isSpeaking ? 'rgba(139,92,246,0.65)' : 'rgba(255,255,255,0.07)',
        boxShadow:   isSpeaking ? '0 0 22px rgba(139,92,246,0.22)' : '0 0 0px transparent',
      }}
      transition={{ duration: 0.4 }}
      className="glass rounded-xl p-3 flex-shrink-0 border overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <motion.span
            animate={{ opacity: isSpeaking ? [1, 0.3, 1] : 1 }}
            transition={{ duration: 0.8, repeat: isSpeaking ? Infinity : 0 }}
            className={`inline-block w-2 h-2 rounded-full ${
              isSpeaking ? 'bg-pulse' : agentStatus === 'connected' ? 'bg-aurora' : 'bg-border'
            }`}
          />
          <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest">
            Algsoch
          </span>
        </div>
        {/* Current action badge */}
        <span className="text-[10px] font-mono text-text-muted flex items-center gap-1">
          <span>{emoji}</span>
          <span className="capitalize">{actionLabel}</span>
          {actionTopic && (
            <span className="ml-1 text-pulse/70 truncate max-w-[80px]" title={actionTopic}>
              · {actionTopic}
            </span>
          )}
        </span>
      </div>

      {/* ── Section 1: What AI is seeing (visual) ── */}
      <div className="mb-2">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[9px]">👁</span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-aurora/70">AI is watching</span>
        </div>
        {ytId ? (
          /* YouTube thumbnail with play icon overlay */
          <div className="relative rounded-lg overflow-hidden border border-aurora/25 bg-black cursor-default">
            <img
              src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
              className="w-full object-cover"
              style={{ maxHeight: '72px' }}
              alt="YouTube thumbnail"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-2xl drop-shadow-lg opacity-90">▶</span>
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 px-1.5 py-0.5">
              <p className="text-[9px] text-white/80 truncate">{contentSource?.label || 'YouTube video'}</p>
            </div>
          </div>
        ) : contentSource?.type === 'screenshare' && screenStream ? (
          /* Live screenshare mini-preview */
          <div className="rounded-lg overflow-hidden border border-aurora/25">
            <ScreenMiniPreview stream={screenStream} />
          </div>
        ) : (
          <div className="bg-surface/50 border border-aurora/10 rounded-lg px-2.5 py-1.5">
            <p className="text-[11px] text-text-secondary">{seenLabel}</p>
          </div>
        )}
      </div>

      {/* ── Section 2: AI speaking ── */}
      <SpeechBubble
        text={fadedSpeech}
        isActive={isSpeaking}
        color="pulse"
        label="AI said"
        icon="🔊"
        side="left"
      />

      {/* ── Section 3: Learner speaking ── */}
      <SpeechBubble
        text={fadedLearner}
        isActive={!!learnerSpeech}
        color="aurora"
        label="You said"
        icon="👤"
        side="right"
      />

      {/* ── Divider + recent interventions ── */}
      <div className="border-t border-border/30 pt-1.5 mt-1">
        <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted block mb-1">
          Recent actions
        </span>
        <div className="space-y-1">
          {interventions.slice(0, 3).map((iv, i) => {
            const ivType   = typeof iv.type === 'string' ? iv.type : null
            const ivEmoji  = (ivType && ACTION_EMOJI[ivType]) ? ACTION_EMOJI[ivType] : '•'
            const ivLabel  = ivType ? ivType.replace(/_/g, ' ') : 'intervention'
            return (
              <div key={i} className="flex items-center gap-1.5 text-[10px] min-w-0">
                <span className="flex-shrink-0 text-aurora">{ivEmoji}</span>
                <span className="text-text-muted font-mono truncate flex-1 capitalize">{ivLabel}</span>
                <span className="text-text-muted ml-auto font-mono flex-shrink-0">
                  {new Date(iv.timestamp).toLocaleTimeString('en', {
                    hour12: false, hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            )
          })}
          {interventions.length === 0 && (
            <p className="text-[10px] text-text-muted font-mono">
              {agentStatus === 'connected' ? 'Analyzing your session…' : 'Connecting to AI agent…'}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SessionPage() {
  const navigate = useNavigate()
  const {
    isInSession, metrics, endSession, userName,
    contentSource, topic, screenStream, setScreenStream,
  } = useSessionStore()

  const agentSpeech   = useSessionStore((s) => s.agentSpeech)
  const agentAction   = useSessionStore((s) => s.agentAction)
  const learnerSpeech = useSessionStore((s) => s.learnerSpeech)

  // Track when AI is speaking (8s window) — used for toast + volume duck
  const [agentIsSpeaking, setAgentIsSpeaking] = useState(false)
  const [toastText, setToastText]             = useState('')
  const contentRef   = useRef(null)

  useEffect(() => {
    if (!agentSpeech) return
    setToastText(agentSpeech)
    setAgentIsSpeaking(true)
    const t = setTimeout(() => setAgentIsSpeaking(false), 8000)
    return () => clearTimeout(t)
  }, [agentSpeech])

  // Connect to backend WebSocket for live metrics (auto-reconnects)
  useBackendConnection()
  // Join the backend's Stream WebRTC call and play agent audio
  useStreamAudio()
  // Direct webcam→backend frame analysis (bypasses Stream WebRTC)
  useWebcamAnalysis()
  // Browser-native microphone STT fallback (fires when Gemini WebRTC STT unavailable)
  useBrowserSTT()
  // Track YouTube video playback progress (currentTime / duration)
  useVideoProgress(contentRef, contentSource?.type === 'youtube')


  // Screen capture — triggered by user button click.
  // Browsers block getDisplayMedia() called from useEffect (requires user gesture).
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      setScreenStream(stream)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => setScreenStream(null))
    } catch {
      // User cancelled or permission denied
    }
  }

  useEffect(() => {
    if (!isInSession) navigate('/')
  }, [isInSession])

  const handleEnd = () => {
    screenStream?.getTracks().forEach((t) => t.stop())
    setScreenStream(null)
    // ── Save session to persistent history before ending ──
    const store = useSessionStore.getState()
    const hist  = store.metricsHistory
    const avg = (key) => hist.length
      ? Math.round(hist.reduce((s, h) => s + (h[key] || 0), 0) / hist.length)
      : 0
    useHistoryStore.getState().addSession({
      id:                  store.sessionId || String(Date.now()),
      topic:               store.topic || '',
      contentSource:       store.contentSource || null,
      startedAt:           store.sessionStartedAt || Date.now(),
      duration:            store.sessionStartedAt ? Date.now() - store.sessionStartedAt : 0,
      avgEngagement:       avg('engagementScore'),
      avgAttention:        avg('attentionScore'),
      questionsAnswered:   store.conversationLog.filter((e) => e.role === 'user').length,
      mastery:             store.mastery || {},
      conversationPreview: store.conversationLog.slice(-8),
    })
    endSession()
    navigate('/dashboard')
  }

  const contentLabel =
    !contentSource                       ? 'Voice only'        :
    contentSource.type === 'youtube'     ? '▶ YouTube'         :
    contentSource.type === 'upload'      ? `📁 ${contentSource.label}` :
    contentSource.type === 'ai_chat'     ? '💬 AI Tutor'       :
    '🖥 Screen share'

  // Safe action label for toast badge
  const actionEmoji = (agentAction?.type && ACTION_EMOJI[agentAction.type])
    ? ACTION_EMOJI[agentAction.type]
    : '🤖'

  return (
    <div className="h-screen bg-void flex flex-col overflow-hidden">
      <AgentStatusBar />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ── Left: main content area ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col p-4 gap-2 min-w-0 overflow-hidden relative">

          {/* Topic badge */}
          {topic && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-mono bg-pulse/10 text-pulse border border-pulse/20 px-3 py-1 rounded-full">
                📚 {topic}
              </span>
              <span className="text-xs text-text-muted font-mono">{contentLabel}</span>
            </div>
          )}

          {/* Video row: lecture + learner cam — fills remaining space */}
          <div className="flex gap-3 flex-1 min-h-0">

            {/* Lecture / content panel */}
            <div className="flex-1 glass rounded-xl overflow-hidden relative flex flex-col">
              <LectureContent
                contentSource={contentSource}
                screenStream={screenStream}
                contentRef={contentRef}
                isSpeaking={agentIsSpeaking}
                startScreenShare={startScreenShare}
              />

              {/* Source badge top-left */}
              <div className="absolute top-3 left-3 pointer-events-none">
                <span className="text-xs font-mono bg-surface/80 border border-border
                                 text-text-secondary px-2 py-1 rounded-md">
                  {contentSource ? contentLabel : 'LECTURE'}
                </span>
              </div>

              {/* AI monitoring indicator top-right */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5
                              bg-surface/70 rounded-md px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-aurora animate-pulse-slow" />
                <span className="text-[10px] font-mono text-aurora">Algsoch watching</span>
              </div>

              {/* ── Agent speech toast (bottom of content panel) ── */}
              <AnimatePresence>
                {agentIsSpeaking && toastText && (
                  <motion.div
                    key={toastText}
                    initial={{ y: 50, opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 50, opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    className="absolute bottom-4 inset-x-4 z-40 flex items-start gap-3
                               bg-void/95 backdrop-blur-md border border-pulse/50
                               rounded-2xl px-4 py-3
                               shadow-[0_0_48px_rgba(139,92,246,0.3)]"
                  >
                    {/* Agent avatar */}
                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-pulse flex items-center
                                    justify-center shadow-glow">
                      <span className="text-[20px]">{actionEmoji}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-bold text-pulse uppercase tracking-wider">
                          Algsoch
                        </span>
                        {agentAction?.type && (
                          <span className="text-[9px] font-mono text-pulse/60 capitalize">
                            · {agentAction.type.replace(/_/g, ' ')}
                          </span>
                        )}
                        <motion.span
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 0.9, repeat: Infinity }}
                          className="ml-auto w-1.5 h-1.5 rounded-full bg-pulse flex-shrink-0"
                        />
                      </div>
                      <p className="text-sm text-text-primary leading-snug line-clamp-2">
                        {toastText}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Volume-ducked overlay for YouTube (postMessage doesn't always work) */}
              <AnimatePresence>
                {agentIsSpeaking && contentSource?.type === 'youtube' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 pointer-events-none rounded-lg z-10"
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Right column: learner cam + Q&A log + AI activity panel  */}
            <div className="w-[300px] flex-shrink-0 flex flex-col gap-2 min-h-0 overflow-y-auto">
              <LearnerCam userName={userName} metrics={metrics} learnerSpeech={learnerSpeech} />
              <ConversationLog />
              <AgentActivityPanel />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              {agentIsSpeaking && (
                <span className="text-xs text-pulse font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pulse animate-pulse inline-block" />
                  Algsoch speaking…
                </span>
              )}
            </div>
            <button
              onClick={handleEnd}
              className="bg-crimson/20 hover:bg-crimson/30 text-crimson border border-crimson/30
                         px-5 py-2 rounded-lg font-medium text-sm transition-all duration-200">
              End Session
            </button>
          </div>
        </div>

        {/* ── Right: metrics sidebar ──────────────────────────────────────── */}
        <div className="w-[280px] flex-shrink-0 flex flex-col gap-3 p-4 border-l
                        border-border overflow-y-auto">
          <AIAgentPanel />
          <MonitoringScopeCard title="Live Monitoring" compact />
          {/* Engagement + Attention side by side */}
          <div className="grid grid-cols-2 gap-2">
            <EngagementMeter score={metrics.engagementScore} label="Engagement" compact />
            <EngagementMeter score={metrics.attentionScore} label="Attention" compact />
          </div>
          <CognitiveLoadIndicator score={metrics.cognitiveLoadScore} />
          <AttentionWaveform />
          <LatencyGraph />
          <VideoProgressGraph />
          <EyeTrackingPanel />
          <MasteryTracker />
          <InterventionFeed />
        </div>
      </div>
    </div>
  )
}
