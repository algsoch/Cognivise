/**
 * EyeTrackingPanel — live eye-tracking metrics panel
 *
 * Shows:
 *  • Gaze direction compass
 *  • Blink rate (blinks/min)
 *  • Fixation duration (s)
 *  • Eye closure duration (ms per blink)
 *  • Eye Aspect Ratio bar (EAR)
 *  • Background movement %
 *  • People in frame count
 */

import { useSessionStore } from '../hooks/useSessionStore'

// ── Gaze direction visual ─────────────────────────────────────────────────────
const GAZE_ICONS = {
  center: '◎',
  left:   '◀',
  right:  '▶',
  up:     '▲',
  down:   '▼',
  away:   '✕',
}
const GAZE_COLORS = {
  center: 'text-aurora',
  left:   'text-text-secondary',
  right:  'text-text-secondary',
  up:     'text-text-secondary',
  down:   'text-text-secondary',
  away:   'text-warning',
}

function GazeCompass({ direction = 'center' }) {
  const dirs = ['up', 'left', 'center', 'right', 'down']
  return (
    <div className="grid grid-cols-3 w-10 h-10 gap-0.5">
      {/* row 0: top-left empty, up, top-right empty */}
      <span />
      <span className={`text-center text-[9px] leading-none flex items-center justify-center ${direction === 'up' ? 'text-aurora' : 'text-border'}`}>▲</span>
      <span />
      {/* row 1: left, center, right */}
      <span className={`text-center text-[9px] leading-none flex items-center justify-center ${direction === 'left' ? 'text-aurora' : 'text-border'}`}>◀</span>
      <span className={`text-center text-[9px] leading-none flex items-center justify-center ${direction === 'center' ? 'text-aurora' : direction === 'away' ? 'text-warning' : 'text-border'}`}>
        {direction === 'away' ? '✕' : '◎'}
      </span>
      <span className={`text-center text-[9px] leading-none flex items-center justify-center ${direction === 'right' ? 'text-aurora' : 'text-border'}`}>▶</span>
      {/* row 2: btm-left empty, down, btm-right empty */}
      <span />
      <span className={`text-center text-[9px] leading-none flex items-center justify-center ${direction === 'down' ? 'text-aurora' : 'text-border'}`}>▼</span>
      <span />
    </div>
  )
}

function MetricRow({ label, value, unit = '', accent = false }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-[11px] font-mono font-semibold tabular-nums ${accent ? 'text-aurora' : 'text-text-secondary'}`}>
        {value}<span className="text-[9px] font-normal text-text-muted ml-0.5">{unit}</span>
      </span>
    </div>
  )
}

function EARBar({ value }) {
  // EAR: 0 = closed, ~0.3 = open normally; scale to 0-100% capped at 0.4
  const pct = Math.min(100, Math.round((value / 0.4) * 100))
  const color = value < 0.18 ? 'bg-warning' : value < 0.25 ? 'bg-amber-400' : 'bg-aurora'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-text-muted w-8 text-right">{value.toFixed(2)}</span>
    </div>
  )
}

export default function EyeTrackingPanel() {
  const metrics = useSessionStore((s) => s.metrics)

  const {
    gazeDirection     = 'center',
    blinkRate         = 0,
    fixationDuration  = 0,
    eyeClosureDuration = 0,
    eyeAR             = 0.3,
    backgroundMovement = 0,
    peopleCount       = 0,
    faceDetected      = false,
  } = metrics

  return (
    <div className="metric-card space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="label-sm">Eye Tracking</span>
        <div className="flex items-center gap-1.5">
          {/* People count badge */}
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface/60 text-text-muted border border-border/30">
            {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
          </span>
          {/* Face detected dot */}
          <span className={`w-1.5 h-1.5 rounded-full ${faceDetected ? 'bg-aurora shadow-glow' : 'bg-border'}`} />
        </div>
      </div>

      {/* Gaze direction row */}
      <div className="flex items-center gap-3 py-1">
        <GazeCompass direction={gazeDirection} />
        <div className="flex-1">
          <div className="text-[9px] text-text-muted mb-0.5">Gaze Direction</div>
          <div className={`text-[13px] font-semibold capitalize ${GAZE_COLORS[gazeDirection] ?? 'text-text-secondary'}`}>
            {gazeDirection}
          </div>
        </div>
      </div>

      {/* EAR bar */}
      <div>
        <div className="text-[9px] text-text-muted mb-1">Eye Openness (EAR)</div>
        <EARBar value={eyeAR} />
      </div>

      {/* Metric rows */}
      <div className="mt-1">
        <MetricRow label="Blink Rate" value={blinkRate.toFixed(1)} unit="bpm" accent />
        <MetricRow label="Fixation Duration" value={fixationDuration.toFixed(1)} unit="s" />
        <MetricRow label="Eye Closure Duration" value={(eyeClosureDuration * 1000).toFixed(0)} unit="ms" />
        <MetricRow
          label="Background Movement"
          value={`${Math.round(backgroundMovement * 100)}`}
          unit="%"
          accent={backgroundMovement > 0.3}
        />
      </div>
    </div>
  )
}
