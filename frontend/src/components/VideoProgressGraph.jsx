/**
 * VideoProgressGraph — two metrics in one panel:
 *
 * 1. Frame Analysis FPS — live bar showing how many webcam frames/sec
 *    are being successfully analyzed by the backend vision pipeline.
 *
 * 2. Video Progress — horizontal progress bar showing elapsed / remaining
 *    time in the current YouTube / uploaded video.
 *
 * Both values come from the session store (updated by useWebcamAnalysis + SessionPage).
 */

import { useSessionStore } from '../hooks/useSessionStore'

const MAX_FPS = 5  // our capture target is 5 fps

export default function VideoProgressGraph() {
  const metrics = useSessionStore((s) => s.metrics)
  const {
    frameFps       = 0,
    videoCurrentTime = 0,
    videoDuration    = 0,
  } = metrics

  const fpsRatio    = Math.min(frameFps / MAX_FPS, 1)
  const progressRatio = videoDuration > 0 ? Math.min(videoCurrentTime / videoDuration, 1) : 0

  const elapsed   = formatTime(videoCurrentTime)
  const remaining = formatTime(Math.max(0, videoDuration - videoCurrentTime))
  const total     = formatTime(videoDuration)

  return (
    <div className="panel rounded-2xl p-4 space-y-4">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Vision &amp; Progress</h3>

      {/* ── Frame Analysis FPS ──────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Frame Analysis</span>
          <span className={`font-mono font-semibold ${frameFps >= 4 ? 'text-emerald-400' : frameFps >= 2 ? 'text-amber-400' : 'text-red-400'}`}>
            {frameFps} fps
          </span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${fpsRatio * 100}%`,
              background: frameFps >= 4
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : frameFps >= 2
                ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                : 'linear-gradient(90deg, #ef4444, #f87171)',
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>0 fps</span>
          <span className={fpsRatio >= 0.8 ? 'text-emerald-400' : ''}>
            {fpsRatio >= 0.8 ? 'Vision Active ✓' : fpsRatio > 0 ? 'Analyzing…' : 'Waiting for camera'}
          </span>
          <span>{MAX_FPS} fps</span>
        </div>
      </div>

      {/* ── Video Progress ──────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Video Progress</span>
          <span className="font-mono text-text-secondary">
            {videoDuration > 0 ? `${elapsed} / ${total}` : '—'}
          </span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progressRatio * 100}%`,
              background: 'linear-gradient(90deg, #6366f1, #818cf8)',
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>{elapsed} elapsed</span>
          {videoDuration > 0 && (
            <span>{Math.round(progressRatio * 100)}%</span>
          )}
          <span>{videoDuration > 0 ? `${remaining} left` : 'No video'}</span>
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
