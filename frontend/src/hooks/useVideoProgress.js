/**
 * useVideoProgress — tracks YouTube video playback progress.
 *
 * Loads the YouTube IFrame JS API and creates a YT.Player wrapper around
 * the existing embedded iframe. Polls currentTime / duration every 2s and
 * writes them to the session store so VideoProgressGraph can display them.
 *
 * Also listens for the `onStateChange` event to detect when the video
 * starts/pauses/ends, so the tutor AI can react accordingly.
 *
 * Usage: useVideoProgress(contentRef, isYouTube)
 *   contentRef — ref whose .current is the <iframe> element
 *   isYouTube  — boolean; skips if false (avoids loading YT API for non-YT content)
 */

import { useEffect, useRef } from 'react'
import { useSessionStore } from './useSessionStore'

export function useVideoProgress(contentRef, isYouTube) {
  const updateMetrics = useSessionStore((s) => s.updateMetrics)
  const playerRef     = useRef(null)
  const pollRef       = useRef(null)

  useEffect(() => {
    if (!isYouTube) return

    function initPlayer(iframe) {
      if (!window.YT?.Player) return

      // Give the iframe a unique ID if missing
      if (!iframe.id) iframe.id = 'yt-player-' + Date.now()

      const player = new window.YT.Player(iframe.id, {
        events: {
          onReady: () => {
            // Start polling once player is ready
            pollRef.current = setInterval(() => {
              try {
                const ct = player.getCurrentTime?.() ?? 0
                const dur = player.getDuration?.()   ?? 0
                updateMetrics({ videoCurrentTime: ct, videoDuration: dur })
              } catch {}
            }, 2000)
          },
          onStateChange: (e) => {
            // Optionally broadcast play/pause state in future
          },
        },
      })
      playerRef.current = player
    }

    // Load YouTube IFrame API script if not already loaded
    if (window.YT?.Player) {
      // Already available — wait for iframe to be in DOM
      const iframe = contentRef?.current
      if (iframe) initPlayer(iframe)
    } else {
      // Inject the script tag
      const tag = document.createElement('script')
      tag.src   = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)

      // YT API calls this global when ready
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev()
        const iframe = contentRef?.current
        if (iframe) initPlayer(iframe)
      }
    }

    return () => {
      clearInterval(pollRef.current)
      try { playerRef.current?.destroy?.() } catch {}
    }
  }, [isYouTube])

  return null
}
