/**
 * EngagementMeter — circular radial gauge showing engagement score.
 */

import { motion } from 'framer-motion'
import clsx from 'clsx'

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function scoreToColor(score) {
  if (score >= 75) return '#00d4b5'   // aurora — good
  if (score >= 45) return '#6c63ff'   // pulse — neutral
  if (score >= 25) return '#f59e0b'   // amber — low
  return '#ef4444'                     // crimson — critical
}

function scoreLabel(score) {
  if (score >= 80) return 'Engaged'
  if (score >= 60) return 'Focused'
  if (score >= 40) return 'Drifting'
  if (score >= 20) return 'Distracted'
  return 'Away'
}

export default function EngagementMeter({ score = 50, label = 'Engagement', compact = false }) {
  const pct = Math.min(100, Math.max(0, score)) / 100
  const dash = pct * CIRCUMFERENCE
  const color = scoreToColor(score)

  // ── Compact mode: small bar card ────────────────────────────────────────
  if (compact) {
    return (
      <div className="metric-card flex flex-col gap-2 py-3">
        <div className="flex items-center justify-between">
          <span className="label-sm text-[10px]">{label}</span>
          <motion.span
            key={Math.round(score)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-lg font-bold font-mono"
            style={{ color }}
          >
            {Math.round(score)}
          </motion.span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color, boxShadow: `0 0 6px ${color}50` }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          />
        </div>
        <span className="text-[10px] font-medium" style={{ color }}>
          {scoreLabel(score)}
        </span>
      </div>
    )
  }

  // ── Full circular gauge ──────────────────────────────────────────────────
  return (
    <div className="metric-card flex flex-col items-center gap-3">
      <span className="label-sm">{label}</span>

      <div className="relative w-[128px] h-[128px]">
        {/* Track */}
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64" cy="64" r={RADIUS}
            fill="none"
            stroke="#1e1e3a"
            strokeWidth="10"
          />
          <motion.circle
            cx="64" cy="64" r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE}`}
            animate={{ strokeDashoffset: CIRCUMFERENCE - dash }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            style={{ filter: `drop-shadow(0 0 8px ${color}60)` }}
          />
        </svg>

        {/* Centre value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={Math.round(score)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-3xl font-bold font-mono"
            style={{ color }}
          >
            {Math.round(score)}
          </motion.span>
          <span className="text-[10px] text-text-muted font-mono mt-0.5">/ 100</span>
        </div>
      </div>

      <span
        className="text-sm font-medium"
        style={{ color }}
      >
        {scoreLabel(score)}
      </span>
    </div>
  )
}
