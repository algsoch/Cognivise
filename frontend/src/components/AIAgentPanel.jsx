/**
 * AIAgentPanel — shows the live AI tutor agent status in the sidebar.
 *
 * Sections
 *   • Pulsing brain avatar + connection badge
 *   • Learner state & engagement at-a-glance
 *   • Last-fired intervention card
 *   • Focus / distraction counters
 */

import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../hooks/useSessionStore'

// ── colour helpers ──────────────────────────────────────────────────────────
const STATE_META = {
  focused:     { emoji: '🎯', label: 'Focused',        color: 'text-aurora',  bg: 'bg-aurora/10',  border: 'border-aurora/25' },
  mastering:   { emoji: '🚀', label: 'Mastering',      color: 'text-pulse',   bg: 'bg-pulse/10',   border: 'border-pulse/25'  },
  distracted:  { emoji: '😶', label: 'Distracted',     color: 'text-amber',   bg: 'bg-amber/10',   border: 'border-amber/25'  },
  neutral:     { emoji: '😐', label: 'Neutral',         color: 'text-text-secondary', bg: 'bg-surface', border: 'border-border' },
  overloaded:  { emoji: '🤯', label: 'Overloaded',     color: 'text-crimson', bg: 'bg-crimson/10', border: 'border-crimson/25'},
  struggling:  { emoji: '😟', label: 'Struggling',     color: 'text-crimson', bg: 'bg-crimson/10', border: 'border-crimson/25'},
  disengaged:  { emoji: '💤', label: 'Disengaged',     color: 'text-amber',   bg: 'bg-amber/10',   border: 'border-amber/25'  },
  bored:       { emoji: '😑', label: 'Bored',           color: 'text-amber',   bg: 'bg-amber/10',   border: 'border-amber/25'  },
}

const INTERVENTION_LABELS = {
  ask_question:        { emoji: '❓', label: 'Question asked'         },
  simplify:            { emoji: '🔍', label: 'Simplified explanation' },
  check_in:            { emoji: '💬', label: 'Check-in prompt'        },
  active_recall:       { emoji: '🧠', label: 'Active recall exercise' },
  increase_difficulty: { emoji: '⬆️', label: 'Challenge increased'    },
  encouragement:       { emoji: '🌟', label: 'Encouragement given'    },
  break_suggestion:    { emoji: '☕', label: 'Break suggested'         },
}

const STATUS_STYLE = {
  connected:    'bg-aurora text-void',
  connecting:   'bg-amber text-void animate-pulse',
  disconnected: 'bg-crimson/80 text-white',
}

function formatElapsed(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return `${m}m ago`
}

function ScoreBar({ value = 50, colorClass = 'bg-pulse' }) {
  return (
    <div className="h-1 w-full rounded-full bg-surface-muted overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${colorClass}`}
        animate={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  )
}

export default function AIAgentPanel() {
  const agentStatus   = useSessionStore((s) => s.agentStatus)
  const metrics       = useSessionStore((s) => s.metrics)
  const interventions = useSessionStore((s) => s.interventions)
  const topic         = useSessionStore((s) => s.topic)

  const {
    learnerState       = 'neutral',
    engagementScore    = 0,
    attentionScore     = 0,
    cognitiveLoadScore = 0,
    focusDuration      = 0,
    distractionCount   = 0,
    blinkRate          = 0,
  } = metrics

  const stateMeta  = STATE_META[learnerState] ?? STATE_META.neutral
  const lastAction = interventions[0] ?? null
  const intMeta    = lastAction
    ? (INTERVENTION_LABELS[lastAction.type] ?? { emoji: '🤖', label: lastAction.type?.replace(/_/g, ' ') })
    : null

  const isConnected = agentStatus === 'connected'

  return (
    <div className="glass rounded-xl overflow-hidden flex flex-col gap-0 border border-border">

      {/* ── Header: avatar + status ───────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2.5 border-b border-border/50">
        {/* Animated brain avatar */}
        <div className="relative flex-shrink-0">
          <motion.div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-lg
              ${isConnected ? 'bg-pulse/20' : 'bg-surface'}`}
            animate={isConnected ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          >
            🧠
          </motion.div>
          {/* Pulse ring */}
          {isConnected && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-pulse/40"
              animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut' }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-text-primary">Algsoch</p>
          {topic && (
            <p className="text-[10px] text-text-muted truncate">📚 {topic}</p>
          )}
        </div>

        {/* Status badge */}
        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[agentStatus] ?? STATUS_STYLE.disconnected}`}>
          {agentStatus.toUpperCase()}
        </span>
      </div>

      {/* ── Learner state ─────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${stateMeta.bg} ${stateMeta.border}`}>
          <span className="text-base leading-none">{stateMeta.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-semibold ${stateMeta.color}`}>{stateMeta.label}</p>
            <p className="text-[9px] text-text-muted">Current state</p>
          </div>
        </div>
      </div>

      {/* ── Live score bars ───────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 flex flex-col gap-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-text-muted w-[60px]">ENGAGE</span>
          <div className="flex-1">
            <ScoreBar value={engagementScore}
              colorClass={engagementScore >= 60 ? 'bg-aurora' : engagementScore >= 35 ? 'bg-amber' : 'bg-crimson'} />
          </div>
          <span className="text-[9px] font-mono text-text-secondary w-[24px] text-right">{Math.round(engagementScore)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-text-muted w-[60px]">ATTEND</span>
          <div className="flex-1">
            <ScoreBar value={attentionScore}
              colorClass={attentionScore >= 60 ? 'bg-pulse' : attentionScore >= 35 ? 'bg-amber' : 'bg-crimson'} />
          </div>
          <span className="text-[9px] font-mono text-text-secondary w-[24px] text-right">{Math.round(attentionScore)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-text-muted w-[60px]">COG LOAD</span>
          <div className="flex-1">
            <ScoreBar value={cognitiveLoadScore}
              colorClass={cognitiveLoadScore >= 70 ? 'bg-crimson' : cognitiveLoadScore >= 40 ? 'bg-amber' : 'bg-aurora'} />
          </div>
          <span className="text-[9px] font-mono text-text-secondary w-[24px] text-right">{Math.round(cognitiveLoadScore)}</span>
        </div>
      </div>

      {/* ── Focus / distraction stats ─────────────────────────────────────── */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-border/50">
        <div className="text-center">
          <p className="text-[11px] font-semibold text-aurora">{Math.round(focusDuration)}s</p>
          <p className="text-[9px] text-text-muted">Focus streak</p>
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="text-center">
          <p className="text-[11px] font-semibold text-amber">{distractionCount}</p>
          <p className="text-[9px] text-text-muted">Distractions</p>
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="text-center">
          <p className="text-[11px] font-semibold text-pulse">{blinkRate.toFixed(1)}</p>
          <p className="text-[9px] text-text-muted">Blinks/min</p>
        </div>
      </div>

      {/* ── Last intervention ─────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <p className="text-[9px] font-mono text-text-muted uppercase tracking-widest">Last action</p>
        <AnimatePresence mode="wait">
          {lastAction ? (
            <motion.div
              key={lastAction.timestamp}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="bg-surface border border-border rounded-lg px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="text-sm leading-none mt-0.5">{intMeta?.emoji ?? '🤖'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-text-primary leading-snug">
                    {intMeta?.label ?? lastAction.type}
                  </p>
                  {lastAction.message && (
                    <p className="text-[9px] text-text-muted mt-0.5 leading-relaxed line-clamp-2">
                      {lastAction.message}
                    </p>
                  )}
                  <p className="text-[9px] text-text-muted mt-1 font-mono">
                    {formatElapsed(lastAction.timestamp)}
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="no-action"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-surface border border-border/50 rounded-lg px-2.5 py-2 text-center"
            >
              <p className="text-[10px] text-text-muted">
                {isConnected ? 'Monitoring… no interventions yet' : 'Waiting for agent connection'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  )
}
