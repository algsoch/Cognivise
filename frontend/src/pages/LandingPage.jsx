/**
 * LandingPage — clean 2-step entry:
 *   Step 1: name + optional topic
 *   Step 2: content source (YouTube / upload / screen share)
 * Session ID is auto-generated — never shown to the user.
 */

import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSessionStore } from '../hooks/useSessionStore'
import { motion, AnimatePresence } from 'framer-motion'

function ytEmbedUrl(raw) {
  try {
    const u = new URL(raw)
    const base = 'rel=0&modestbranding=1&enablejsapi=1'
    if (u.hostname === 'youtu.be')
      return `https://www.youtube.com/embed${u.pathname}?${base}`
    const v = u.searchParams.get('v')
    if (v) return `https://www.youtube.com/embed/${v}?${base}`
    if (u.pathname.startsWith('/embed/')) {
      const sep = raw.includes('?') ? '&' : '?'
      return raw.includes('enablejsapi') ? raw : `${raw}${sep}enablejsapi=1`
    }
  } catch {}
  return null
}

const SOURCES = [
  { id: 'youtube',     icon: '▶️',  label: 'YouTube Video',  hint: 'Paste a link' },
  { id: 'upload',      icon: '📁',  label: 'Upload Video',   hint: 'MP4, MOV, WebM' },
  { id: 'screenshare', icon: '🖥',  label: 'Screen Share',   hint: 'Share a tab/window' },
]

export default function LandingPage() {
  const navigate   = useNavigate()
  const [searchParams] = useSearchParams()
  const { setUser, startSession, setContentSource } = useSessionStore()
  // If returning=1 (from Dashboard's New Session), pre-fill name+email from store
  const storedName  = useSessionStore((s) => s.userName)
  const storedEmail = useSessionStore((s) => s.userEmail)
  const isReturning = searchParams.get('returning') === '1'

  const [name, setName]   = useState(isReturning && storedName  ? storedName  : '')
  const [email, setEmail] = useState(isReturning && storedEmail ? storedEmail : '')
  const [topic, setTopic] = useState('')
  // Returning users skip straight to step 2 (source picker)
  const [step, setStep]   = useState(isReturning && storedName ? 2 : 1)

  const [sourceType, setSourceType]     = useState(null)
  const [ytUrl, setYtUrl]               = useState('')
  const [ytError, setYtError]           = useState('')
  const [uploadedFile, setUploadedFile] = useState(null)
  const fileInputRef = useRef(null)

  // Fetch YouTube video title via oEmbed when user pastes a YT URL
  // Auto-fills the topic field so the AI knows what video is being studied.
  const fetchYtTitle = async (url) => {
    if (!url.trim()) return
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      )
      if (res.ok) {
        const data = await res.json()
        if (data.title && !topic.trim()) {
          setTopic(data.title)
        }
      }
    } catch {
      // silent — topic field stays empty, user can type manually
    }
  }

  const goToStep2 = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setStep(2)
  }

  // Email validation: optional but must be valid format if provided
  const emailValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const handleStart = (skipContent = false) => {
    const userId    = `user_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
    const callId    = `call_${Date.now()}`
    const sessionId = `sess_${Date.now()}`

    // ── Build content source object first so we can send content_label ──
    let contentSourceObj = null
    if (!skipContent) {
      if (sourceType === 'youtube') {
        const embed = ytEmbedUrl(ytUrl)
        if (!embed) { setYtError('Could not parse YouTube URL'); return }
        contentSourceObj = { type: 'youtube', url: embed, label: topic.trim() || ytUrl }
      } else if (sourceType === 'upload' && uploadedFile) {
        contentSourceObj = { type: 'upload', url: URL.createObjectURL(uploadedFile), label: uploadedFile.name }
      } else if (sourceType === 'screenshare') {
        contentSourceObj = { type: 'screenshare', url: null, label: 'Screen Share' }
      }
    }

    setUser(userId, name.trim(), email.trim() || null)
    startSession(sessionId, callId, topic.trim())

    // ── Tell the backend agent to JOIN — include user's real name + email ──
    fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call_id:   callId,
        call_type: 'default',
        user_id:   userId,
        user_name: name.trim(),
        user_email: email.trim() || null,
        topic:     topic.trim() || null,
      }),
    }).catch(() => {})

    // ── Session config: send topic + content_label + email so backend uses it
    // For screen-share, don't send 'Screen Share' as content_label (it's a mode,
    // not a topic — backend will auto-detect the real topic from screen frames).
    const safeLabel = contentSourceObj?.type === 'screenshare'
      ? null
      : (contentSourceObj?.label || null)
    fetch('/api/session/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic:         topic.trim() || null,
        content_label: safeLabel,
        content_type:  contentSourceObj?.type  || null,
        user_id:       userId,
        user_name:     name.trim(),
        user_email:    email.trim() || null,
        call_id:       callId,
      }),
    }).catch(() => {})

    if (contentSourceObj) setContentSource(contentSourceObj)
    navigate('/session')
  }

  const step2Ready =
    (sourceType === 'youtube' && ytUrl.trim()) ||
    (sourceType === 'upload' && uploadedFile) ||
    sourceType === 'screenshare'

  return (
    <div className="min-h-screen bg-void flex flex-col">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[30%] w-[600px] h-[600px] rounded-full bg-pulse/5 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[20%] w-[400px] h-[400px] rounded-full bg-aurora/5 blur-3xl" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-lg"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-pulse flex items-center justify-center shadow-glow">
              <span className="text-white font-bold text-sm">IL</span>
            </div>
            <div>
              <h1 className="font-bold text-text-primary text-lg tracking-tight">Intelligent Learn</h1>
              <p className="text-xs text-text-muted font-mono">Adaptive Learning Vision Agent</p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step ? 'w-8 bg-pulse' : s < step ? 'w-4 bg-pulse/60' : 'w-4 bg-border'
                }`}
              />
            ))}
            <span className="text-xs text-text-muted ml-1 font-mono">Step {step} of 2</span>
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="s1"
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}
              >
                <h2 className="text-3xl font-bold text-text-primary mb-2 leading-snug">
                  Learn deeper.<br /><span className="text-pulse">Understand faster.</span>
                </h2>
                <p className="text-text-secondary text-sm mb-8 leading-relaxed">
                  The AI watches, listens, and adapts in real-time — turning passive watching
                  into guaranteed understanding.
                </p>

                <form onSubmit={goToStep2} className="space-y-4">
                  <div>
                    <label className="label-sm block mb-1.5">Your Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Vicky" autoFocus required
                      className="input-base w-full" />
                  </div>
                  <div>
                    <label className="label-sm block mb-1.5">
                      Email <span className="text-text-muted font-normal">(optional — to track your progress)</span>
                    </label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input-base w-full" />
                    {email.trim() && !emailValid && (
                      <p className="text-xs text-crimson mt-1">Please enter a valid email address</p>
                    )}
                  </div>
                  <div>
                    <label className="label-sm block mb-1.5">
                      Topic <span className="text-text-muted font-normal">(optional — AI auto-detects from screen)</span>
                    </label>
                    <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                      placeholder="Leave blank — AI reads your screen content automatically"
                      className="input-base w-full" />
                  </div>
                  <button type="submit" disabled={!name.trim() || !emailValid}
                    className="btn-primary w-full py-3.5 text-base mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    Continue →
                  </button>
                </form>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}
              >
                <h2 className="text-2xl font-bold text-text-primary mb-1">What are you studying?</h2>
                <p className="text-text-secondary text-sm mb-6">
                  The vision agent watches <span className="text-pulse font-medium">you</span> and{' '}
                  <span className="text-aurora font-medium">the content</span> simultaneously.
                </p>

                {/* Source cards */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {SOURCES.map(({ id, icon, label, hint }) => (
                    <button key={id} type="button"
                      onClick={() => { setSourceType(id); setYtError('') }}
                      className={`glass rounded-xl p-4 flex flex-col items-center gap-2 text-center border
                                  transition-all duration-200 cursor-pointer
                                  ${sourceType === id
                                    ? 'border-pulse/70 ring-1 ring-pulse/30 bg-pulse/5'
                                    : 'border-border hover:border-pulse/40'}`}>
                      <span className="text-2xl">{icon}</span>
                      <span className="text-sm font-semibold text-text-primary">{label}</span>
                      <span className="text-[11px] text-text-muted">{hint}</span>
                    </button>
                  ))}
                </div>

                <AnimatePresence>
                  {sourceType === 'youtube' && (
                    <motion.div key="yt"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                      <label className="label-sm block mb-1.5">YouTube URL</label>
                      <input type="url" value={ytUrl}
                        onChange={(e) => {
                          const val = e.target.value
                          setYtUrl(val)
                          setYtError('')
                          // Auto-fetch YouTube video title to pre-fill topic field
                          fetchYtTitle(val)
                        }}
                        onBlur={(e) => fetchYtTitle(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=…" autoFocus
                        className="input-base w-full font-mono text-sm" />
                      {ytError && <p className="text-crimson text-xs mt-1">{ytError}</p>}
                    </motion.div>
                  )}
                  {sourceType === 'upload' && (
                    <motion.div key="up"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                      <input ref={fileInputRef} type="file" accept="video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          setUploadedFile(file)
                          // Auto-fill topic from filename when topic field is empty
                          if (file && !topic.trim()) {
                            const autoTopic = file.name
                              .replace(/\.[^.]+$/, '')         // strip extension
                              .replace(/[-_]/g, ' ')            // underscores/dashes → spaces
                              .replace(/\s+/g, ' ')             // collapse spaces
                              .trim()
                            if (autoTopic) setTopic(autoTopic)
                          }
                        }}
                        className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="w-full glass border border-dashed border-border hover:border-pulse/50
                                   rounded-xl py-6 flex flex-col items-center gap-2 transition-all duration-200">
                        {uploadedFile ? (
                          <><span className="text-2xl">✅</span>
                            <span className="text-sm text-text-primary font-medium">{uploadedFile.name}</span>
                            <span className="text-xs text-text-muted">Click to change</span></>
                        ) : (
                          <><span className="text-2xl">📁</span>
                            <span className="text-sm text-text-primary">Click to browse</span>
                            <span className="text-xs text-text-muted">MP4, MOV, WebM, AVI…</span></>
                        )}
                      </button>
                    </motion.div>
                  )}
                  {sourceType === 'screenshare' && (
                    <motion.div key="ss"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                      <div className="glass border border-aurora/30 rounded-xl px-4 py-3 text-sm text-aurora flex items-center gap-2">
                        <span>🖥</span>
                        <span>Your browser will ask for screen access when the session starts.</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={() => setStep(1)}
                    className="btn-ghost flex-1 py-3 text-sm">← Back</button>
                  <button type="button" onClick={() => handleStart(false)}
                    disabled={!step2Ready}
                    className="btn-primary flex-[2] py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed">
                    Start Learning Session
                  </button>
                </div>

                <button type="button" onClick={() => handleStart(true)}
                  className="w-full text-center text-xs text-text-muted mt-4 hover:text-text-secondary transition-colors">
                  Skip — use voice agent only
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
