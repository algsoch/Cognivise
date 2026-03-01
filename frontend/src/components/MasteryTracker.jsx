/**
 * MasteryTracker — topic mastery progress board.
 */

import { motion } from 'framer-motion'
import { useSessionStore } from '../hooks/useSessionStore'

function MasteryBar({ topic, score }) {
  const color =
    score >= 80 ? '#22c55e' :
    score >= 55 ? '#6c63ff' :
    score >= 30 ? '#f59e0b' : '#ef4444'

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-text-secondary truncate max-w-[180px]">{topic}</span>
        <span className="text-xs font-mono font-semibold" style={{ color }}>
          {Math.round(score)}%
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}60` }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

export default function MasteryTracker() {
  const mastery = useSessionStore((s) => s.mastery)
  const entries = Object.entries(mastery)

  return (
    <div className="metric-card">
      <span className="label-sm block mb-4">Mastery Progress</span>

      {entries.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-4">
          No topics tracked yet
        </p>
      ) : (
        entries
          .sort((a, b) => b[1] - a[1])
          .map(([topic, score]) => (
            <MasteryBar key={topic} topic={topic} score={score} />
          ))
      )}
    </div>
  )
}
