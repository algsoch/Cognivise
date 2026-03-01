/**
 * CognitiveLoadIndicator — horizontal bar showing cognitive load level.
 */

import { motion } from 'framer-motion'
import clsx from 'clsx'

const ZONES = [
  { threshold: 30, label: 'Optimal', color: '#00d4b5' },
  { threshold: 60, label: 'Moderate', color: '#f59e0b' },
  { threshold: 85, label: 'High',     color: '#f97316' },
  { threshold: 101, label: 'Critical', color: '#ef4444' },
]

function getZone(score) {
  return ZONES.find((z) => score < z.threshold) || ZONES[ZONES.length - 1]
}

export default function CognitiveLoadIndicator({ score = 30 }) {
  const zone = getZone(score)
  const pct = Math.min(100, Math.max(0, score))

  return (
    <div className="metric-card">
      <div className="flex items-center justify-between mb-3">
        <span className="label-sm">Cognitive Load</span>
        <span className="text-xs font-mono font-semibold" style={{ color: zone.color }}>
          {zone.label}
        </span>
      </div>

      {/* Bar track */}
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        {/* Gradient fill */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, #00d4b5 0%, #f59e0b 55%, #ef4444 100%)`,
            filter: `drop-shadow(0 0 6px ${zone.color}80)`,
          }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
        />
      </div>

      {/* Zone labels */}
      <div className="flex justify-between mt-1.5 text-[10px] font-mono text-text-muted">
        <span>Optimal</span>
        <span>High</span>
        <span>Critical</span>
      </div>

      {/* Score */}
      <div className="text-center mt-2">
        <span className="text-2xl font-bold font-mono" style={{ color: zone.color }}>
          {Math.round(score)}
        </span>
        <span className="text-text-muted text-xs font-mono ml-1">/ 100</span>
      </div>
    </div>
  )
}
