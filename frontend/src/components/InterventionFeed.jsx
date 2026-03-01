/**
 * InterventionFeed — live log of agent interventions in the session.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../hooks/useSessionStore'

const TYPE_LABELS = {
  'ask_question':        { label: 'Question',         color: '#6c63ff' },
  'simplify':            { label: 'Simplified',        color: '#f59e0b' },
  'break_down':          { label: 'Broken Down',       color: '#a855f7' },
  'increase_difficulty': { label: 'Challenged',        color: '#22c55e' },
  'active_recall':       { label: 'Recall Test',       color: '#00d4b5' },
  'check_in':            { label: 'Check-in',          color: '#9090b8' },
  'encouragement':       { label: 'Encouraged',        color: '#22c55e' },
}

function relativeTime(ts) {
  const secs = Math.round((Date.now() - ts) / 1000)
  if (secs < 60) return `${secs}s ago`
  return `${Math.round(secs / 60)}m ago`
}

export default function InterventionFeed() {
  const interventions = useSessionStore((s) => s.interventions)

  return (
    <div className="metric-card">
      <span className="label-sm block mb-3">Interventions</span>

      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {interventions.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">
              No interventions yet
            </p>
          )}
          {interventions
            .filter((item) => item.type && item.type !== 'none' && item.type !== 'NONE')
            .map((item, i) => {
            const cfg = TYPE_LABELS[item.type] || { label: item.type?.replace(/_/g, ' ') ?? 'action', color: '#9090b8' }
            return (
              <motion.div
                key={item.timestamp}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border"
              >
                <span
                  className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: cfg.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-text-muted font-mono flex-shrink-0">
                      {relativeTime(item.timestamp)}
                    </span>
                  </div>
                  {item.message && (
                    <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                      {item.message}
                    </p>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
