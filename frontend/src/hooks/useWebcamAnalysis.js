/**
 * useWebcamAnalysis — captures webcam frames locally and posts them to the
 * backend /api/analyze-frame endpoint at 5 fps.
 *
 * This completely bypasses Stream WebRTC for face analysis, making eye
 * tracking, people count, EAR, and gaze metrics work reliably regardless of
 * whether the Stream WebRTC call is connected.
 *
 * Architecture:
 *   Browser → canvas → JPEG base64 → POST /api/analyze-frame
 *   Backend → MediaPipe FaceLandmarker → metrics → WebSocket broadcast
 *   Frontend WebSocket → useBackendConnection → updateMetrics → store
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useSessionStore } from './useSessionStore'

const API_BASE = 'http://localhost:8001'
const FRAME_INTERVAL_MS = 200   // 5 fps — enough for smooth eye metrics
const JPEG_QUALITY      = 0.65  // compressed JPEG; face analysis works fine at this quality
const FRAME_WIDTH       = 320   // scale down before sending (saves bandwidth)
const FRAME_HEIGHT      = 240

export function useWebcamAnalysis(enabled = false) {
  const isInSession  = useSessionStore((s) => s.isInSession)
  const updateMetrics = useSessionStore((s) => s.updateMetrics)
  const streamRef    = useRef(null)
  const canvasRef    = useRef(null)
  const timerRef     = useRef(null)
  const busyRef      = useRef(false)   // don't queue frames if last one is still in-flight
  const fpsCountRef  = useRef(0)       // frames successfully sent this second
  const fpsTimerRef  = useRef(null)    // 1-second FPS publish interval
  const [cameraStatus, setCameraStatus] = useState('idle') // idle | requesting | running | denied | error | stopped
  const [cameraError, setCameraError] = useState('')

  const stopCapture = useCallback(() => {
    clearInterval(timerRef.current)
    clearInterval(fpsTimerRef.current)
    timerRef.current = null
    fpsTimerRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraStatus('stopped')
    setCameraError('')
    updateMetrics({ frameFps: 0 })
  }, [])

  useEffect(() => {
    if (!isInSession && !enabled) { stopCapture(); return }

    let cancelled = false

    async function start() {
      try {
        setCameraStatus('requesting')
        setCameraError('')
        // Get webcam stream (video only — no audio needed for face analysis)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: FRAME_WIDTH, height: FRAME_HEIGHT, facingMode: 'user' },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        // Create hidden video element to receive the stream
        const video = document.createElement('video')
        video.srcObject = stream
        video.playsInline = true
        video.muted = true
        await video.play()
        setCameraStatus('running')

        // Create canvas for frame capture
        const canvas = document.createElement('canvas')
        canvas.width  = FRAME_WIDTH
        canvas.height = FRAME_HEIGHT
        canvasRef.current = canvas
        const ctx = canvas.getContext('2d')

        // Capture loop
        timerRef.current = setInterval(async () => {
          if (busyRef.current || cancelled) return
          if (video.readyState < 2) return  // not enough data yet

          busyRef.current = true
          try {
            ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
            const b64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY)

            const res = await fetch(`${API_BASE}/api/analyze-frame`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ frame: b64 }),
              // short timeout so stale frames don't back up
              signal: AbortSignal.timeout(2000),
            })
            fpsCountRef.current++  // count successful frame deliveries
            // Response is also broadcast via WS — we don't need to parse it here
          } catch {
            // Ignore individual frame errors (network hiccup, backend not ready yet)
          } finally {
            busyRef.current = false
          }
        }, FRAME_INTERVAL_MS)

        // Publish FPS every second so VideoProgressGraph can display it
        fpsTimerRef.current = setInterval(() => {
          updateMetrics({ frameFps: fpsCountRef.current })
          fpsCountRef.current = 0
        }, 1000)

      } catch (err) {
        if (!cancelled) {
          const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          setCameraStatus(denied ? 'denied' : 'error')
          setCameraError(err?.message || 'Could not access camera')
          updateMetrics({ frameFps: 0 })
          console.warn('[useWebcamAnalysis] webcam access failed:', err?.message)
        }
      }
    }

    start()
    return () => {
      cancelled = true
      stopCapture()
    }
  }, [isInSession, enabled, stopCapture])

  return { cameraStatus, cameraError }
}
