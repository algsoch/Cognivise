/**
 * useStreamAudio — joins the backend Stream WebRTC call, publishes the
 * learner's webcam video so the Vision Agent backend can do face analysis,
 * and auto-plays the agent's TTS audio in the browser.
 *
 * Critical path:
 *   1. Fetch token from GET /api/token
 *   2. Create a fresh StreamVideoClient (never reuse stale cached instance)
 *   3. join() the call with camera + mic disabled for publish, then enable camera
 *   4. Publish webcam video → Vision Agent backend receives it for analysis
 *   5. Watch remoteParticipants$ → attach agent audio to hidden <audio> elements
 *   6. Unlock browser AudioContext on first user interaction
 */

import { useEffect, useRef } from 'react'
import { useSessionStore } from './useSessionStore'
import { setGeminiAudioActive } from './useBackendConnection'

const API_BASE = 'http://localhost:8001'

// Unlock browser AudioContext by creating and resuming it on first gesture
let _audioCtx = null
function ensureAudioUnlocked() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {})
  }
}
document.addEventListener('click', ensureAudioUnlocked, { once: true })
document.addEventListener('keydown', ensureAudioUnlocked, { once: true })

export function useStreamAudio() {
  const streamCallId   = useSessionStore((s) => s.streamCallId)
  const streamCallType = useSessionStore((s) => s.streamCallType)
  const localCallId    = useSessionStore((s) => s.callId)          // set by LandingPage.handleStart
  const userId         = useSessionStore((s) => s.userId) ?? 'learner'
  const contentSource  = useSessionStore((s) => s.contentSource)   // { type: 'screenshare' | ... }

  // Use whichever call ID is available first: backend-broadcast OR locally-generated
  const effectiveCallId = streamCallId || localCallId

  const sdkRef = useRef({
    client:    null,
    call:      null,
    audioEls:  new Map(),
    unsubscribe: null,
    camStream: null,
  })

  useEffect(() => {
    if (!effectiveCallId) return

    let cancelled = false

    async function joinAndListen() {
      try {
        ensureAudioUnlocked()

        // ── 1. Token ──────────────────────────────────────────────────────
        const uid = userId || 'learner'
        const res  = await fetch(`${API_BASE}/api/token?user_id=${encodeURIComponent(uid)}`)
        const data = await res.json()
        if (!res.ok || !data.token || !data.api_key) {
          console.warn('[useStreamAudio] token fetch failed:', data)
          return
        }
        if (cancelled) return

        // ── 2. Fresh StreamVideoClient (never reuse stale) ────────────────
        const { StreamVideoClient } = await import('@stream-io/video-react-sdk')
        if (cancelled) return

        // Always create a new instance to avoid stale cached sessions
        const client = new StreamVideoClient({
          apiKey: data.api_key,
          user:   { id: uid },
          token:  data.token,
        })
        sdkRef.current.client = client

        if (cancelled) { client.disconnectUser().catch(() => {}); return }

        // ── 3. Join call ──────────────────────────────────────────────────
        const call = client.call(streamCallType ?? 'default', effectiveCallId)

        // Disable camera/mic before join to control publish timing
        await call.camera.disable()
        await call.microphone.disable()

        // create:true so the learner creates the call if the agent hasn't yet
        // (backend's start_session runs async — might lag a few seconds)
        try {
          await call.join({ create: true })
        } catch (e) {
          console.warn('[useStreamAudio] join failed, retrying in 2s...', e?.message)
          await new Promise(r => setTimeout(r, 2000))
          if (cancelled) return
          await call.join({ create: true })
        }
        if (cancelled) { call.leave().catch(() => {}); return }

        sdkRef.current.call = call

        // ── 4. Publish camera video so Vision Agent backend can see it ────
        // The backend EngagementProcessor processes video from call participants
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, frameRate: 10 },
            audio: false,
          })
          if (cancelled) { camStream.getTracks().forEach(t => t.stop()); return }

          sdkRef.current.camStream = camStream

          // Publish video + microphone so the agent can see and hear the learner
          const [videoTrack] = camStream.getVideoTracks()
          if (videoTrack) {
            await call.camera.enable()
          }
          // Enable mic so the backend Vision Agent can transcribe learner speech
          try {
            await call.microphone.enable()
            console.log('[useStreamAudio] 📹🎤 Publishing camera+mic to Stream call')
          } catch (micErr) {
            console.warn('[useStreamAudio] mic publish failed:', micErr?.message)
          }

          // ── Screen share → Gemini can see the content being studied ──────
          // Enabled when learner chose "Screen Share" as their content source.
          // call.screenShare.enable() triggers getDisplayMedia() and publishes
          // the screen as a second video track in the Stream call.
          // The Vision Agent (Gemini) receives ALL video tracks → sees the screen.
          if (contentSource?.type === 'screenshare') {
            try {
              await call.screenShare.enable()
              console.log('[useStreamAudio] 🖥 Screen share published to Stream call (Gemini can see it)')
            } catch (screenErr) {
              console.warn('[useStreamAudio] screen share publish failed:', screenErr?.message)
            }
          }
        } catch (camErr) {
          console.warn('[useStreamAudio] camera publish failed (agent audio still works):', camErr?.message)
        }

        // ── 5. Wire audio for remote participants (agent TTS) ─────────────
        function syncAudio(participants) {
          console.debug('[useStreamAudio] syncAudio: participants=', participants?.length ?? 0, participants?.map(p => p.userId))
          const alive = new Set()
          for (const p of participants) {
            if (p.userId === uid) continue
            const stream = p.audioStream
            if (!stream) continue

            const key = p.sessionId
            alive.add(key)

            let el = sdkRef.current.audioEls.get(key)
            if (!el) {
              el = document.createElement('audio')
              el.autoplay      = true
              el.style.display = 'none'
              document.body.appendChild(el)
              sdkRef.current.audioEls.set(key, el)
              console.log('[useStreamAudio] 🔊 Agent audio attached for', p.userId, '— stream tracks:', stream.getTracks().length)
              // Gemini WebRTC audio is live — suppress browser TTS fallback
              setGeminiAudioActive(true)
            }
            if (el.srcObject !== stream) {
              el.srcObject = stream
              // Resume AudioContext so autoplay works
              ensureAudioUnlocked()
              el.play().catch((err) => {
                console.warn('[useStreamAudio] audio.play() blocked:', err?.message)
              })
            }
          }
          // Tear down stale elements
          for (const [key, el] of sdkRef.current.audioEls) {
            if (!alive.has(key)) {
              el.srcObject = null; el.remove()
              sdkRef.current.audioEls.delete(key)
            }
          }
        }

        // Store unsubscribe as a function — handle both RxJS Subscription and plain functions
        const _sub = call.state.remoteParticipants$.subscribe(syncAudio)
        sdkRef.current.unsubscribe = typeof _sub === 'function'
          ? _sub
          : () => _sub?.unsubscribe?.()
        syncAudio(call.state.remoteParticipants ?? [])

        console.log('[useStreamAudio] ✅ Joined Stream call', effectiveCallId)

      } catch (err) {
        if (!cancelled) console.warn('[useStreamAudio] error:', err?.message ?? err)
      }
    }

    joinAndListen()

    return () => {
      cancelled = true
      sdkRef.current.unsubscribe?.()
      for (const el of sdkRef.current.audioEls.values()) {
        el.srcObject = null; el.remove()
      }
      sdkRef.current.audioEls.clear()
      sdkRef.current.camStream?.getTracks().forEach(t => t.stop())
      sdkRef.current.camStream = null
      // Disable screen share before leaving (if active)
      sdkRef.current.call?.screenShare?.disable?.().catch?.(() => {})
      sdkRef.current.call?.leave().catch(() => {})
      sdkRef.current.call = null
      sdkRef.current.client?.disconnectUser().catch(() => {})
      sdkRef.current.client = null
    }
  // Re-run when either the backend-broadcast callId OR the local one changes
  // Use a comma-joined key to avoid double-joining the same call
  }, [effectiveCallId])
}
