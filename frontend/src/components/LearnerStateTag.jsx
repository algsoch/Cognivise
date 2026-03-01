/**
 * LearnerStateTag — badge showing the current cognitive state label.
 */

import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'

const STATE_CONFIG = {
  focused:    { label: 'Focused',          color: '#00d4b5', bg: '#00d4b511' },
  mastering:  { label: 'Mastering',        color: '#22c55e', bg: '#22c55e11' },
  neutral:    { label: 'Neutral',          color: '#6c63ff', bg: '#6c63ff11' },
  distracted: { label: 'Distracted',       color: '#f59e0b', bg: '#f59e0b11' },
  disengaged: { label: 'Disengaged',       color: '#f97316', bg: '#f9731611' },
  overloaded: { label: 'Overloaded',       color: '#ef4444', bg: '#ef444411' },
  struggling: { label: 'Struggling',       color: '#a855f7', bg: '#a855f711' },
}

export default function LearnerStateTag({ state = 'neutral' }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.neutral

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={state}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.25 }}
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold border"
        style={{
          color: cfg.color,
          background: cfg.bg,
          borderColor: `${cfg.color}40`,
          boxShadow: `0 0 12px ${cfg.color}20`,
        }}
      >
        {/* Dot */}
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse-slow"
          style={{ background: cfg.color }}
        />
        {cfg.label}
      </motion.span>
    </AnimatePresence>
  )
}
