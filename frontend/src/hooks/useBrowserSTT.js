/**
 * useBrowserSTT — Web Speech API microphone fallback.
 *
 * Fires when Stream WebRTC is unavailable (Gemini Realtime STT not connected).
 * Captures mic audio continuously in the browser, sends final transcripts to
 * the backend reasoning loop via { learner_message } over WebSocket, and
 * updates the latency store so LatencyGraph has data.
 *
 * User latency  = time from agent_speech → first user final transcript.
 * AI latency    = tracked in useBackendConnection (time from message send → next agent_speech).
 */

import { useEffect, useRef } from 'react'
import { useSessionStore } from './useSessionStore'

export function useBrowserSTT() {
  const setLearnerSpeech     = useSessionStore((s) => s.setLearnerSpeech)
  const addConversationEntry = useSessionStore((s) => s.addConversationEntry)
  const updateMetrics        = useSessionStore((s) => s.updateMetrics)
  // Watch agentSpeech so we know when AI finished its response
  const agentSpeech = useSessionStore((s) => s.agentSpeech)

  // Track when AI last spoke — used to calc user response latency
  const questionAskedAt = useRef(0)
  const prevSpeechRef   = useRef('')

  useEffect(() => {
    if (agentSpeech && agentSpeech !== prevSpeechRef.current) {
      questionAskedAt.current = Date.now()
      prevSpeechRef.current   = agentSpeech
    }
  }, [agentSpeech])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      console.warn('[BrowserSTT] Web Speech API not available — mic disabled')
      return
    }

    const recognition        = new SR()
    recognition.continuous     = true
    recognition.interimResults = true
    recognition.lang           = 'en-US'

    let active = true

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          const text = transcript.trim()
          if (!text) continue

          // Calculate how long after AI spoke the user responded
          const userMs = questionAskedAt.current > 0
            ? Math.min(Date.now() - questionAskedAt.current, 60_000)
            : 0
          questionAskedAt.current = 0 // reset for next turn

          // Send to backend reasoning loop
          const sr = useSessionStore.getState().sendRaw
          if (sr) sr({ learner_message: text })

          // Update UI immediately (don't wait for backend echo)
          setLearnerSpeech(text)
          addConversationEntry('user', text)
          if (userMs > 0) updateMetrics({ userResponseMs: userMs })

          interim = ''
        } else {
          interim += transcript
        }
      }
      // Show live partial transcript while user is speaking
      if (interim) setLearnerSpeech(interim)
    }

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') {
        console.error('[BrowserSTT] Microphone permission denied — grant mic access in browser')
        active = false
      } else if (e.error !== 'no-speech') {
        console.warn('[BrowserSTT] error:', e.error)
      }
    }

    recognition.onend = () => {
      // Continuous mode sometimes stops on its own — restart unless unmounted
      if (active) setTimeout(() => { if (active) { try { recognition.start() } catch {} } }, 200)
    }

    try {
      recognition.start()
      console.info('[BrowserSTT] Microphone listening (Web Speech API fallback)')
    } catch (e) {
      console.warn('[BrowserSTT] Could not start:', e.message)
    }

    return () => {
      active = false
      try { recognition.stop() } catch {}
    }
  }, []) // mount once — questionAskedAt ref carries state

  return null
}
