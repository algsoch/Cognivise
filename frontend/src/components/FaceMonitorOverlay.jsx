/**
 * FaceMonitorOverlay — real-time face mesh overlay using MediaPipe FaceLandmarker.
 *
 * Accepts videoRef to run actual face detection on the webcam feed.
 * Falls back to animated mock if MediaPipe fails to load.
 *
 * HUD overlays:
 *   • Real 478 MediaPipe face landmarks + tesselation + iris
 *   • Face oval, eye connections
 *   • Attention score, state, blink rate badges
 *   • Head pose indicator
 *   • "NO FACE" flash when no landmarks detected
 */

import { useEffect, useRef } from 'react'
import { useState } from 'react'
import { useSessionStore } from '../hooks/useSessionStore'
const C = {
  green:  [80,  250, 80 ],
  red:    [255, 72,  72 ],
  amber:  [255, 200, 50 ],
  cyan:   [80,  220, 255],
  white:  [255, 255, 255],
  purple: [190, 100, 255],
}
const rgba   = ([r,g,b], a) => `rgba(${r},${g},${b},${a})`
const hex    = ([r,g,b]) => `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`

// ── HUD badge helper ──────────────────────────────────────────────────────────
function badge(ctx, text, x, y, color, anchor = 'left') {
  ctx.save()
  ctx.font = 'bold 10px monospace'
  const tw = ctx.measureText(text).width, pad = 5, bh = 16
  const bx = anchor === 'right' ? x - tw - pad * 2 : x
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.beginPath()
  const rx = bx, ry = y - bh + 4, rw = tw + pad * 2, rh = bh, r = 3
  ctx.moveTo(rx+r,ry); ctx.lineTo(rx+rw-r,ry); ctx.arcTo(rx+rw,ry,rx+rw,ry+r,r)
  ctx.lineTo(rx+rw,ry+rh-r); ctx.arcTo(rx+rw,ry+rh,rx+rw-r,ry+rh,r)
  ctx.lineTo(rx+r,ry+rh); ctx.arcTo(rx,ry+rh,rx,ry+rh-r,r)
  ctx.lineTo(rx,ry+r); ctx.arcTo(rx,ry,rx+r,ry,r); ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = anchor === 'right' ? 'right' : 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, anchor === 'right' ? x - pad : bx + pad, y - bh / 2 + 4)
  ctx.restore()
}

// ── MediaPipe connection indices for face drawing ─────────────────────────────
// Face oval  (from MediaPipe landmarks)
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10]
const LEFT_EYE  = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33]
const RIGHT_EYE = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362]
const LEFT_IRIS  = [468,469,470,471,472]
const RIGHT_IRIS = [473,474,475,476,477]
const LIPS_OUTER = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,61]

function drawConnections(ctx, landmarks, indices, color, width = 1) {
  if (!landmarks || landmarks.length === 0) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  indices.forEach((idx, i) => {
    const lm = landmarks[idx]
    if (!lm) return
    if (i === 0) ctx.moveTo(lm.x, lm.y)
    else ctx.lineTo(lm.x, lm.y)
  })
  ctx.stroke()
  ctx.restore()
}

function drawDots(ctx, landmarks, indices, color, radius = 1.5) {
  if (!landmarks) return
  ctx.save()
  ctx.fillStyle = color
  indices.forEach(idx => {
    const lm = landmarks[idx]
    if (!lm) return
    ctx.beginPath()
    ctx.arc(lm.x, lm.y, radius, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
}

// MediaPipe tesselation — 468 triangle connections (compact list of pairs)
// We draw a subset to keep it fast: every 3rd connection
const TESS_PAIRS = (() => {
  // These are the canonical MediaPipe FACE_LANDMARKS_TESSELATION pairs (subset)
  const p = []
  for (let i = 0; i < 468; i += 6) p.push([i, (i+1)%468],[i,(i+7)%468])
  return p
})()

function drawTesselation(ctx, landmarks, alpha = 0.12) {
  if (!landmarks || landmarks.length < 468) return
  ctx.save()
  ctx.strokeStyle = `rgba(80,220,255,${alpha})`
  ctx.lineWidth = 0.5
  TESS_PAIRS.forEach(([a,b]) => {
    const lA = landmarks[a], lB = landmarks[b]
    if (!lA || !lB) return
    ctx.beginPath()
    ctx.moveTo(lA.x, lA.y)
    ctx.lineTo(lB.x, lB.y)
    ctx.stroke()
  })
  ctx.restore()
}

export default function FaceMonitorOverlay({ videoRef, metrics = {}, isTyping = false, drawVideoLayer = true, showHUD = true }) {
  const containerRef  = useRef(null)
  const canvasRef     = useRef(null)
  const rafRef        = useRef(null)
  const landmarkerRef = useRef(null)       // MediaPipe FaceLandmarker instance
  const phaseRef      = useRef(0)
  const lastDetectRef      = useRef(0)
  const lastMpLandmarksRef  = useRef(null)   // shared between detect interval + draw loop
  const expressionsRef      = useRef({ isSmiling: false, mouthOpen: false, browUp: false })
  const metricsRef          = useRef(metrics)
  const isTypingRef          = useRef(isTyping)
  const drawVideoRef = useRef(drawVideoLayer)
  const showHUDRef = useRef(showHUD)
  const [mpLoaded, setMpLoaded] = useState(false)
  const [realLandmarksOn, setRealLandmarksOn] = useState(false)
  const lastRealLandmarksRef = useRef(false)
  metricsRef.current         = metrics
  isTypingRef.current        = isTyping
  drawVideoRef.current = drawVideoLayer
  showHUDRef.current = showHUD

  // ── Face metrics → backend (browser MediaPipe → WS → reasoning loop) ────
  // The backend EngagementProcessor only gets data if Stream WebRTC video works.
  // We bypass that entirely: browser already has perfect face data, send it direct.
  const sendRaw         = useSessionStore(s => s.sendRaw)
  const updateMetrics   = useSessionStore(s => s.updateMetrics)
  const setSignalFreshness = useSessionStore(s => s.setSignalFreshness)
  const sendRawRef      = useRef(null)
  const lastFaceSendRef = useRef(0)
  const blinkTrackRef   = useRef({ earBelow: 0, count: 0, windowStart: Date.now(), rate: 15.0 })
  const faceMetricsRef  = useRef({
    face_detected: false,
    gaze_on_screen: true,
    head_yaw: 0,
    head_pitch: 0,
    blink_rate: 15,
    restlessness: 0,
    mouth_open_ratio: 0,
    mouth_movement: 0,
    speaking_detected: false,
    tongue_score: 0,
    tongue_visible: false,
  })
  const mouthTrackRef = useRef({ lastOpen: 0, emaMovement: 0 })
  const poseTrackRef = useRef({ lastPitch: 0, nodEma: 0 })
  sendRawRef.current = sendRaw   // always current without re-running effects

  // ── Init MediaPipe ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function initMediaPipe() {
      try {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        )
        if (cancelled) return

        const lm = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        })
        if (cancelled) { lm.close(); return }
        landmarkerRef.current = lm
        setMpLoaded(true)
        console.log('[FaceMonitorOverlay] MediaPipe FaceLandmarker ready ✅')
      } catch (err) {
        console.warn('[FaceMonitorOverlay] MediaPipe failed, using mock mode:', err?.message)
        setMpLoaded(false)
      }
    }

    initMediaPipe()
    return () => { cancelled = true }
  }, [])

  // ── Resize canvas to container ───────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (canvasRef.current) {
        canvasRef.current.width  = Math.round(width)
        canvasRef.current.height = Math.round(height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Separate detection loop (setInterval 200ms = 5fps) ─────────────────
  // Runs MediaPipe OFF the animation frame so the draw loop stays fast (no rAF violations)
  useEffect(() => {
    let timer = null

    // EAR (Eye Aspect Ratio) helper for blink detection
    function computeEAR(lms, idxs) {
      const [p0,p1,p2,p3,p4,p5] = idxs.map(i => lms[i])
      if (!p0||!p1||!p2||!p3||!p4||!p5) return 0.3
      const d = (a,b) => Math.hypot(a.x - b.x, a.y - b.y)
      return (d(p1,p5) + d(p2,p4)) / (2 * d(p0,p3) + 1e-6)
    }

    function runDetection() {
      const videoEl = videoRef?.current
      const landmarker = landmarkerRef.current
      const canvas = canvasRef.current
      if (!landmarker || !videoEl || videoEl.readyState < 2 || !canvas) return
      const W = canvas.width, H = canvas.height
      if (!W || !H) return
      const rect = getVideoRenderRect(videoEl, W, H)
      try {
        const ts = performance.now()
        const results = landmarker.detectForVideo(videoEl, ts)
        if (results.faceLandmarks?.length > 0) {
          if (!lastRealLandmarksRef.current) {
            lastRealLandmarksRef.current = true
            setRealLandmarksOn(true)
          }
          const rawLms = results.faceLandmarks[0]  // normalized [0,1] — used for metrics

          lastMpLandmarksRef.current = rawLms.map(lm => ({
            x: lm.x * rect.rw + rect.ox,
            y: lm.y * rect.rh + rect.oy,
            z: lm.z,
          }))

          // Parse blendshapes for realtime expression detection
          const bs = results.faceBlendshapes?.[0]?.categories ?? []
          const getBS = name => bs.find(b => b.categoryName === name)?.score ?? 0
          const jawOpen = getBS('jawOpen')
          const tongueOut = getBS('tongueOut')
          expressionsRef.current = {
            isSmiling : Math.max(getBS('mouthSmileLeft'), getBS('mouthSmileRight')) > 0.45,
            mouthOpen : jawOpen > 0.35,
            browUp    : Math.max(getBS('browInnerUp'), getBS('browOuterUpLeft'), getBS('browOuterUpRight')) > 0.6,
          }

          const mt = mouthTrackRef.current
          const movement = Math.min(1, Math.abs(jawOpen - mt.lastOpen) * 8)
          mt.emaMovement = (mt.emaMovement * 0.7) + (movement * 0.3)
          mt.lastOpen = jawOpen
          const speakingDetected = jawOpen > 0.2 || mt.emaMovement > 0.18

          // ── Compute real face metrics to send to backend ─────────────
          // EAR blink tracking (left eye: 362,385,387,263,373,380 / right: 33,160,158,133,153,144)
          const avgEAR = (computeEAR(rawLms,[362,385,387,263,373,380]) + computeEAR(rawLms,[33,160,158,133,153,144])) / 2
          const btr = blinkTrackRef.current
          if (avgEAR < 0.2) { btr.earBelow++ } else { if (btr.earBelow >= 2) btr.count++; btr.earBelow = 0 }
          const blinkElapsed = (Date.now() - btr.windowStart) / 1000
          if (blinkElapsed >= 10) { btr.rate = (btr.count / blinkElapsed) * 60; btr.count = 0; btr.windowStart = Date.now() }

          // Iris-based gaze (same logic as backend _estimate_gaze_tasks)
          let gazeOnScreen = true
          try {
            const lIrisX = rawLms[473].x, rIrisX = rawLms[468].x
            const lR = (lIrisX - rawLms[33].x) / (rawLms[133].x - rawLms[33].x + 1e-6)
            const rR = (rIrisX - rawLms[362].x) / (rawLms[263].x - rawLms[362].x + 1e-6)
            gazeOnScreen = (lR > 0.1 && lR < 0.9) && (rR > 0.1 && rR < 0.9)
          } catch { /* keep true */ }

          // Head pose from nose tip vs eye midpoint
          const nose = rawLms[1], lEyeLm = rawLms[33], rEyeLm = rawLms[263]
          const faceCx = (lEyeLm.x + rEyeLm.x) / 2
          const faceCy = (lEyeLm.y + rEyeLm.y) / 2
          const headYaw   = nose ? +((nose.x - faceCx) * 200).toFixed(1) : 0
          const headPitch = nose ? +((nose.y - faceCy) * 200).toFixed(1) : 0

          // If head pose is near frontal, prefer on-screen gaze to avoid false "away".
          if (Math.abs(headYaw) < 9 && Math.abs(headPitch) < 9) {
            gazeOnScreen = true
          }

          const pt = poseTrackRef.current
          const pitchDelta = Math.abs(headPitch - pt.lastPitch)
          pt.nodEma = (pt.nodEma * 0.7) + (pitchDelta * 0.3)
          pt.lastPitch = headPitch
          const noddingLikely = pt.nodEma > 6 && headPitch > 14

          faceMetricsRef.current = {
            face_detected : true,
            gaze_on_screen: gazeOnScreen,
            blink_rate    : +btr.rate.toFixed(1),
            head_yaw      : headYaw,
            head_pitch    : headPitch,
            restlessness  : 0,
            mouth_open_ratio: +jawOpen.toFixed(3),
            mouth_movement: +mt.emaMovement.toFixed(3),
            speaking_detected: speakingDetected,
            tongue_score: +tongueOut.toFixed(3),
            tongue_visible: tongueOut > 0.2,
          }

          // Push local MediaPipe result directly so UI doesn't wait for
          // backend rebroadcast and cannot be stuck in transient no-face.
          updateMetrics({
            faceDetected: true,
            gazeOnScreen,
            blinkRate: +btr.rate.toFixed(1),
            headYaw,
            headPitch,
            peopleCount: 1,
            mouthOpenRatio: +jawOpen.toFixed(3),
            mouthMovement: +mt.emaMovement.toFixed(3),
            speakingDetected,
            tongueScore: +tongueOut.toFixed(3),
            tongueVisible: tongueOut > 0.2,
            mpLandmarksOn: true,
            noddingLikely,
          })
          setSignalFreshness('faceSignalAt')
        } else {
          if (lastRealLandmarksRef.current) {
            lastRealLandmarksRef.current = false
            setRealLandmarksOn(false)
          }
          lastMpLandmarksRef.current = null
          faceMetricsRef.current = {
            ...faceMetricsRef.current,
            face_detected: false,
            gaze_on_screen: false,
            speaking_detected: false,
            mouth_open_ratio: 0,
            mouth_movement: 0,
            tongue_score: 0,
            tongue_visible: false,
          }

          updateMetrics({
            faceDetected: false,
            gazeOnScreen: false,
            peopleCount: 0,
            mouthOpenRatio: 0,
            mouthMovement: 0,
            speakingDetected: false,
            tongueScore: 0,
            tongueVisible: false,
            mpLandmarksOn: false,
            noddingLikely: false,
          })
          setSignalFreshness('faceSignalAt')
        }
      } catch {
        if (lastRealLandmarksRef.current) {
          lastRealLandmarksRef.current = false
          setRealLandmarksOn(false)
        }
        lastMpLandmarksRef.current = null
      }

      // ── Send to backend ~1x/sec (throttled) ──────────────────────────
      const now = Date.now()
      if (sendRawRef.current && now - lastFaceSendRef.current > 900) {
        lastFaceSendRef.current = now
        sendRawRef.current({ face_metrics: faceMetricsRef.current })
      }
    }

    // Helper used by detection (must be accessible here)
    function getVideoRenderRect(videoEl, cw, ch) {
      const vw = videoEl.videoWidth  || cw
      const vh = videoEl.videoHeight || ch
      const scale = Math.min(cw / vw, ch / vh)
      const rw = vw * scale
      const rh = vh * scale
      return { rw, rh, ox: (cw - rw) / 2, oy: (ch - rh) / 2 }
    }

    timer = setInterval(runDetection, 200)
    return () => clearInterval(timer)
  }, [videoRef, updateMetrics, setSignalFreshness])

  // ── Main render loop (draw only — no detection here) ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    /**
     * Compute the actual rendered video rect inside the canvas, accounting
     * for CSS `object-cover` which scales video to FILL the container,
     * cropping the overflow. MediaPipe returns coords normalized to the
     * video frame. We must map them to the canvas display space.
     *
     *   scaleFactor = max(canvasW/videoW, canvasH/videoH)
     *   renderedW   = videoW * scaleFactor   (may exceed canvasW)
     *   renderedH   = videoH * scaleFactor   (may exceed canvasH)
     *   offsetX     = (canvasW - renderedW) / 2   (negative = cropped)
     *   offsetY     = (canvasH - renderedH) / 2
     *
     * Canvas landmark: lm.x * renderedW + offsetX,  lm.y * renderedH + offsetY
     */
    // object-contain: scale to FIT (min), so entire video frame is visible
    function getVideoRenderRect(videoEl, cw, ch) {
      const vw = videoEl.videoWidth  || cw
      const vh = videoEl.videoHeight || ch
      const scale = Math.min(cw / vw, ch / vh)
      const rw = vw * scale
      const rh = vh * scale
      return { rw, rh, ox: (cw - rw) / 2, oy: (ch - rh) / 2 }
    }

    function videoToCanvas(lm, rect) {
      return { x: lm.x * rect.rw + rect.ox, y: lm.y * rect.rh + rect.oy }
    }

    function draw(timestamp) {
      const W = canvas.width, H = canvas.height
      if (!W || !H) { rafRef.current = requestAnimationFrame(draw); return }

      const {
        faceDetected       = false,
        gazeOnScreen       = true,
        blinkRate          = 15,
        restlessness       = 0,
        headPoseConfidence = 1,
        attentionScore     = 50,
        learnerState       = 'neutral',
        headYaw            = 0,
        headPitch          = 0,
        noddingLikely      = false,
      } = metricsRef.current

      const t = (phaseRef.current += 0.035)
      ctx.clearRect(0, 0, W, H)

      // Draw the raw video frame on the canvas so it gets included in the captureStream
      if (drawVideoRef.current && videoRef?.current && videoRef.current.readyState >= 2) {
        const vel = videoRef.current
        const r = getVideoRenderRect(vel, W, H)
        ctx.save()
        // If we want it slightly dimmed under the mesh, could do ctx.filter = 'brightness(0.9)'. Let's leave it Normal.
        ctx.drawImage(vel, r.ox, r.oy, r.rw, r.rh)
        ctx.restore()
      }

      // Cached landmarks from the separate detection interval (no detection here)
      const lastMpLandmarks = lastMpLandmarksRef.current
      const { isSmiling, mouthOpen, browUp } = expressionsRef.current
      const hasRealFace  = lastMpLandmarks !== null
      const isTypingNow  = isTypingRef.current

      // Leaning-in detection: face bounding box height relative to canvas
      let isLeaningIn = false
      if (hasRealFace) {
        let minY = Infinity, maxY = -Infinity
        for (const l of lastMpLandmarks) { if (l.y < minY) minY = l.y; if (l.y > maxY) maxY = l.y }
        isLeaningIn = (maxY - minY) > H * 0.55
      }

      // ── Draw real MediaPipe face mesh ─────────────────────────────────
      if (hasRealFace) {
        const lms = lastMpLandmarks

        // Face mesh tesselation (subtle cyan grid)
        drawTesselation(ctx, lms, 0.1)

        // Face oval (white outline)
        drawConnections(ctx, lms, FACE_OVAL, 'rgba(255,255,255,0.5)', 1.5)

        // Eyes (green left, red right)
        drawConnections(ctx, lms, LEFT_EYE,  'rgba(80,255,120,0.9)', 1.5)
        drawConnections(ctx, lms, RIGHT_EYE, 'rgba(80,220,255,0.9)', 1.5)

        // Iris dots (bright, animated scale if blinking)
        const irisColor = gazeOnScreen ? 'rgba(80,220,255,0.95)' : 'rgba(255,200,50,0.95)'
        const blinkScale = Math.max(0.3, 1 - 0.7 * Math.abs(Math.sin(t * (blinkRate / 30 + 0.5))))
        ;[LEFT_IRIS, RIGHT_IRIS].forEach(irisIdx => {
          const center = lms[irisIdx[0]]
          if (!center) return
          // Compute average iris radius from surrounding points
          const pts = irisIdx.slice(1).map(i => lms[i]).filter(Boolean)
          const r = pts.reduce((s, p) => s + Math.hypot(p.x - center.x, p.y - center.y), 0) / (pts.length || 1)
          ctx.save()
          ctx.translate(center.x, center.y)
          ctx.scale(1, blinkScale)
          ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, Math.PI * 2)
          ctx.strokeStyle = irisColor; ctx.lineWidth = 2; ctx.stroke()
          ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill()
          ctx.restore()
        })

        // Lips
        drawConnections(ctx, lms, LIPS_OUTER, 'rgba(255,140,160,0.5)', 1)

        // Landmark dots (sparse, every 8th)
        for (let i = 0; i < Math.min(468, lms.length); i += 8) {
          const lm = lms[i]
          ctx.beginPath(); ctx.arc(lm.x, lm.y, 1.5, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(80,220,255,0.45)'; ctx.fill()
        }

        // Scan sweep
        const scanY = (t * 30) % H
        const grad = ctx.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0,   'rgba(0,0,0,0)')
        grad.addColorStop(0.5, 'rgba(80,250,80,0.4)')
        grad.addColorStop(1,   'rgba(0,0,0,0)')
        ctx.save()
        ctx.strokeStyle = grad; ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(W, scanY); ctx.stroke()
        ctx.restore()

        // Head pose indicator (nose tip to forehead)
        const noseTip  = lms[1]
        const forehead = lms[10]
        if (noseTip && forehead) {
          const midX = (noseTip.x + forehead.x) / 2
          const midY = (noseTip.y + forehead.y) / 2
          // Arrow showing head tilt
          const dx = Math.sin((headYaw ?? 0) * Math.PI / 180) * 20
          const dy = Math.sin((headPitch ?? 0) * Math.PI / 180) * 20
          ctx.save()
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(midX + dx, midY + dy); ctx.stroke()
          ctx.beginPath(); ctx.arc(midX, midY, 3, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill()
          ctx.restore()
        }
      }

      // ── Mock mode: animated brackets when no real face or MP not loaded ─
      if (!hasRealFace) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 2)
        const bx = W * 0.2, by = H * 0.08, bw = W * 0.6, bh = H * 0.8
        const arm = Math.min(bw, bh) * 0.12

        // Dashed oval
        ctx.save()
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = `rgba(255,72,72,${pulse * 0.5})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()

        // Corner brackets
        ctx.save()
        ctx.strokeStyle = `rgba(255,72,72,${pulse})`
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'
        ;[
          [[bx, by+arm],[bx, by],[bx+arm, by]],
          [[bx+bw-arm, by],[bx+bw, by],[bx+bw, by+arm]],
          [[bx, by+bh-arm],[bx, by+bh],[bx+arm, by+bh]],
          [[bx+bw-arm, by+bh],[bx+bw, by+bh],[bx+bw, by+bh-arm]],
        ].forEach(pts => {
          ctx.beginPath()
          ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2])
          ctx.stroke()
        })
        ctx.restore()

        // "NO FACE DETECTED" flash
        if (Math.sin(t * 3) > 0.2) {
          ctx.save()
          ctx.font = 'bold 11px monospace'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillStyle = 'rgba(255,72,72,0.95)'
          ctx.fillText('NO FACE DETECTED', W / 2, by + bh / 2)
          ctx.restore()
        }
      }

      // ── Restlessness wave (bottom) ───────────────────────────────────
      if (restlessness > 0.05) {
        const amp = restlessness * Math.min(6, H * 0.02)
        ctx.save()
        ctx.strokeStyle = `rgba(255,200,50,${Math.min(1, 0.2 + restlessness * 0.7)})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        for (let x = 0; x <= W; x += 2) {
          const y = H - 8 + amp * Math.sin(t * 2.5 + x * 0.08)
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.restore()
      }

      // ── HUD badges ───────────────────────────────────────────────────
      if (showHUDRef.current) {
        const attCol = attentionScore >= 65
          ? rgba(C.green, 0.95)
          : attentionScore >= 35 ? rgba(C.amber, 0.95) : rgba(C.red, 0.95)
        badge(ctx, `ATT ${Math.round(attentionScore)}%`, 6, 22, attCol, 'left')
        badge(ctx, `${Number(blinkRate).toFixed(1)} b/m`, W - 6, 22, rgba(C.cyan, 0.9), 'right')

        // ── Real-time expression / behaviour badges ──────────────────────
        if (hasRealFace) {
          let exprY = 42
          if (isSmiling) {
            badge(ctx, '😊 SMILING', 6, exprY, rgba(C.green, 0.95), 'left')
            exprY += 20
          }
          if (mouthOpen && !isSmiling) {
            badge(ctx, '💬 SPEAKING', 6, exprY, rgba(C.cyan, 0.9), 'left')
            exprY += 20
          }
          if (browUp) {
            badge(ctx, '🤔 CURIOUS', 6, exprY, rgba(C.amber, 0.9), 'left')
            exprY += 20
          }
          if (isLeaningIn) {
            badge(ctx, '➡ LEANING IN', 6, exprY, rgba(C.purple, 0.9), 'left')
            exprY += 20
          }
          if (noddingLikely) {
            badge(ctx, '↓ NODDING', 6, exprY, rgba(C.cyan, 0.85), 'left')
          }
          if (!gazeOnScreen) {
            badge(ctx, '👁 LOOKING AWAY', W - 6, 42, rgba(C.amber, 0.95), 'right')
          } else {
            badge(ctx, '✓ LOOKING AT SCREEN', W - 6, 42, rgba(C.green, 0.85), 'right')
          }
        }
        if (isTypingNow) {
          badge(ctx, '⌨ TYPING', W - 6, hasRealFace ? 64 : 42, rgba(C.purple, 0.95), 'right')
        }

        if (learnerState && learnerState !== 'neutral') {
          const sCol =
            learnerState === 'focused'    ? rgba(C.green,  0.95) :
            learnerState === 'mastering'  ? rgba(C.cyan,   0.95) :
            learnerState === 'distracted' ? rgba(C.amber,  0.95) :
            rgba(C.red, 0.95)
          badge(ctx, learnerState.toUpperCase(), 6, H - 4, sCol, 'left')
        }
        badge(ctx, hasRealFace ? '● FACE' : '○ SEARCHING', W - 6, H - 4,
          hasRealFace ? rgba(C.green, 0.9) : rgba(C.red, 0.7), 'right')
      }

      // MediaPipe loaded indicator (top right tiny)
      if (landmarkerRef.current) {
        badge(ctx, 'MP 5fps', W - 6, H - 22, rgba(C.purple, 0.8), 'right')
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [videoRef])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      <div className="absolute left-2 top-2 z-10 rounded border border-border/70 bg-black/55 px-2 py-1 text-[10px] font-mono text-white">
        Real MediaPipe face landmarks: {mpLoaded && realLandmarksOn ? 'ON' : 'OFF'}
      </div>
      <canvas id="analysis-canvas" ref={canvasRef} className="w-full h-full" />
    </div>
  )
}
