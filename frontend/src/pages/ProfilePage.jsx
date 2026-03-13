/**
 * ProfilePage — shows the learner's past sessions, mastery history,
 * and lets them resume any previous session topic.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useHistoryStore } from '../hooks/useHistoryStore'
import { useSessionStore } from '../hooks/useSessionStore'

const SOURCE_ICON = {
  youtube:     '▶️',
  upload:      '📁',
  screenshare: '🖥',
  ai_chat:     '💬',
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function ScorePill({ val, color }) {
  return (
    <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded" style={{ color, background: color + '22' }}>
      {val != null ? Math.round(val) + '%' : '—'}
    </span>
  )
}

function SessionCard({ session, onResume, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const masteryEntries = Object.entries(session.mastery || {}).sort((a, b) => b[1] - a[1])

  const engColor =
    (session.avgEngagement ?? 50) >= 70 ? '#22c55e' :
    (session.avgEngagement ?? 50) >= 45 ? '#6c63ff' : '#f59e0b'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface/50 border border-border rounded-xl overflow-hidden"
    >
      {/* Card header */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-pulse/10 flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
          {SOURCE_ICON[session.contentSource?.type] || '📚'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary text-sm truncate">
            {session.topic || 'General Learning Session'}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">{formatDate(session.startedAt)}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-text-secondary bg-muted/40 px-2 py-0.5 rounded-full">
              ⏱ {formatDuration(session.duration)}
            </span>
            {session.contentSource?.label && (
              <span className="text-xs text-text-secondary bg-muted/40 px-2 py-0.5 rounded-full truncate max-w-[180px]">
                {session.contentSource.label}
              </span>
            )}
            <ScorePill val={session.avgEngagement} color={engColor} />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Engagement', val: session.avgEngagement, color: '#6c63ff' },
                  { label: 'Attention',  val: session.avgAttention,  color: '#00d4b5' },
                  { label: 'Q&A',        val: null, raw: `${session.questionsAnswered ?? 0} answered`, color: '#f59e0b' },
                ].map(({ label, val, raw, color }) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-2 text-center">
                    <div className="text-xs text-text-muted mb-0.5">{label}</div>
                    <div className="text-sm font-bold font-mono" style={{ color }}>
                      {raw ?? (val != null ? Math.round(val) + '%' : '—')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Mastery topics */}
              {masteryEntries.length > 0 && (
                <div>
                  <div className="text-xs text-text-muted mb-1.5 font-medium uppercase tracking-wide">Topics Mastered</div>
                  <div className="space-y-1.5">
                    {masteryEntries.slice(0, 5).map(([topic, score]) => {
                      const c = score >= 80 ? '#22c55e' : score >= 55 ? '#6c63ff' : score >= 30 ? '#f59e0b' : '#ef4444'
                      return (
                        <div key={topic} className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-text-secondary truncate">{topic}</div>
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: c }} />
                          </div>
                          <div className="text-xs font-mono w-8 text-right" style={{ color: c }}>{Math.round(score)}%</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Conversation preview */}
              {session.conversationPreview?.length > 0 && (
                <div>
                  <div className="text-xs text-text-muted mb-1.5 font-medium uppercase tracking-wide">Last Q&amp;A</div>
                  <div className="space-y-1">
                    {session.conversationPreview.slice(0, 4).map((entry, i) => (
                      <div key={i} className={`text-xs px-2 py-1 rounded ${entry.role === 'ai' ? 'bg-pulse/10 text-pulse' : 'bg-muted/30 text-text-secondary'}`}>
                        <span className="font-semibold">{entry.role === 'ai' ? 'AI' : 'You'}:</span>{' '}
                        {entry.text?.slice(0, 80)}{entry.text?.length > 80 ? '…' : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onResume(session)}
                  className="flex-1 bg-pulse/20 hover:bg-pulse/30 text-pulse text-xs font-semibold
                             py-2 rounded-lg transition-all duration-200 border border-pulse/30"
                >
                  ▶ Resume Topic
                </button>
                <button
                  onClick={() => onDelete(session.id)}
                  className="text-xs text-text-muted hover:text-crimson border border-border
                             hover:border-crimson/40 px-3 py-2 rounded-lg transition-all"
                >
                  🗑
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Stats aggregate ───────────────────────────────────────────────────────────
function LifetimeStats({ sessions }) {
  if (!sessions.length) return null
  const totalMs = sessions.reduce((s, x) => s + (x.duration || 0), 0)
  const avgEng  = sessions.reduce((s, x) => s + (x.avgEngagement || 50), 0) / sessions.length
  const totalQA = sessions.reduce((s, x) => s + (x.questionsAnswered || 0), 0)
  const uniqueTopics = new Set(sessions.map((s) => s.topic).filter(Boolean)).size

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Sessions',       val: sessions.length, color: '#6c63ff', icon: '📅' },
        { label: 'Total Time',     val: formatDuration(totalMs), color: '#00d4b5', icon: '⏱' },
        { label: 'Avg Engagement', val: Math.round(avgEng) + '%', color: '#f59e0b', icon: '⚡' },
        { label: 'Q&A Completed',  val: totalQA, color: '#22c55e', icon: '🧠' },
      ].map(({ label, val, color, icon }) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-surface/50 border border-border rounded-xl p-3 text-center"
        >
          <div className="text-2xl mb-1">{icon}</div>
          <div className="text-xl font-bold font-mono" style={{ color }}>{val}</div>
          <div className="text-xs text-text-muted mt-0.5">{label}</div>
        </motion.div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const navigate = useNavigate()
  const { sessions, removeSession, clearHistory } = useHistoryStore()
  const { setContentSource, setUser, startSession, userName, userEmail } = useSessionStore()
  const [search, setSearch] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const filtered = sessions.filter((s) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      s.topic?.toLowerCase().includes(q) ||
      s.contentSource?.label?.toLowerCase().includes(q)
    )
  })

  const handleResume = (session) => {
    // Pre-fill the landing page with same topic & source
    if (session.contentSource) setContentSource(session.contentSource)
    navigate('/?returning=1')
  }

  return (
    <div className="min-h-screen bg-void">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-void/95 backdrop-blur z-10"
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-text-muted hover:text-text-primary transition-colors text-sm">
            ← Back
          </button>
          <div className="w-9 h-9 rounded-xl bg-pulse/20 flex items-center justify-center">
            <span className="text-pulse font-bold text-sm">👤</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary leading-tight">
              {userName || 'Your Profile'}
            </h1>
            {userEmail && <p className="text-xs text-text-muted">{userEmail}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/english-coach')}
            className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30
                       text-emerald-400 px-3 py-1.5 rounded-lg font-medium transition-all"
          >
            🗣 English Coach
          </button>
          <button
            onClick={() => navigate('/')}
            className="text-xs bg-pulse/10 hover:bg-pulse/20 border border-pulse/30
                       text-pulse px-3 py-1.5 rounded-lg font-medium transition-all"
          >
            + New Session
          </button>
        </div>
      </motion.header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Lifetime stats */}
        <LifetimeStats sessions={sessions} />

        {/* Session history */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary">
            Session History
            <span className="ml-2 text-xs font-normal text-text-muted">({sessions.length})</span>
          </h2>
          {sessions.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-text-muted hover:text-crimson transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Search */}
        {sessions.length > 3 && (
          <input
            type="text"
            placeholder="Search by topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm
                       text-text-primary placeholder-text-muted focus:outline-none focus:border-pulse/50 mb-4"
          />
        )}

        {/* Cards */}
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 text-text-muted"
          >
            <div className="text-5xl mb-4">📭</div>
            <p className="text-base font-medium text-text-secondary">No sessions yet</p>
            <p className="text-sm mt-1">Complete a learning session to see it here.</p>
            <button
              onClick={() => navigate('/')}
              className="mt-5 bg-pulse/20 hover:bg-pulse/30 text-pulse border border-pulse/30
                         px-5 py-2 rounded-lg text-sm font-medium transition-all"
            >
              Start Learning
            </button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {filtered.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onResume={handleResume}
                onDelete={removeSession}
              />
            ))}
          </div>
        )}
      </div>

      {/* Clear confirm modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-base font-bold text-text-primary mb-2">Clear all history?</h3>
              <p className="text-sm text-text-muted mb-5">This permanently deletes all {sessions.length} session records. Cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 border border-border text-text-secondary hover:text-text-primary py-2 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { clearHistory(); setShowClearConfirm(false) }}
                  className="flex-1 bg-crimson/20 hover:bg-crimson/30 text-crimson border border-crimson/30 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Delete All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
