/**
 * DashboardPage — post-session summary and historical mastery.
 */

import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../hooks/useSessionStore'
import { motion } from 'framer-motion'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  LineChart, Line, XAxis, Tooltip, YAxis, Area, AreaChart,
} from 'recharts'

const TYPE_LABELS = {
  ask_question:        { label: 'Question',         icon: '❓', color: '#6c63ff' },
  simplify:            { label: 'Simplified',        icon: '💡', color: '#f59e0b' },
  break_down:          { label: 'Broken Down',       icon: '🔍', color: '#a855f7' },
  increase_difficulty: { label: 'Challenged',        icon: '⬆️', color: '#22c55e' },
  active_recall:       { label: 'Recall Test',       icon: '🧠', color: '#00d4b5' },
  check_in:            { label: 'Check-in',          icon: '🙋', color: '#9090b8' },
  encouragement:       { label: 'Encouraged',        icon: '⭐', color: '#22c55e' },
  engage:              { label: 'Engaged',           icon: '🚀', color: '#6c63ff' },
}

function relativeTime(ts) {
  const secs = Math.round((Date.now() - ts) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}

function MasteryBar({ topic, score }) {
  const color =
    score >= 80 ? '#22c55e' :
    score >= 55 ? '#6c63ff' :
    score >= 30 ? '#f59e0b' : '#ef4444'
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary truncate max-w-[160px]">{topic}</span>
        <span className="text-xs font-mono font-semibold" style={{ color }}>
          {score > 0 ? `${Math.round(score)}%` : 'Studying…'}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}55` }}
          animate={{ width: score > 0 ? `${score}%` : '4%' }}
          initial={{ width: '0%' }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { metricsHistory, mastery, interventions, topic, conversationLog } = useSessionStore()

  const masteryEntries = Object.entries(mastery).sort((a, b) => b[1] - a[1])

  const radarData = [
    { axis: 'Engagement',    val: avg(metricsHistory, 'engagementScore') },
    { axis: 'Attention',     val: avg(metricsHistory, 'attentionScore') },
    { axis: 'Focus Time',    val: Math.min(100, metricsHistory.length * 3) },
    { axis: 'Recall',        val: avg(metricsHistory, 'performanceScore') },
    { axis: 'Clarity',       val: 100 - avg(metricsHistory, 'cognitiveLoadScore') },
  ]

  const trendData = metricsHistory
    .filter((_, i) => i % 3 === 0)
    .slice(-40)
    .map((h, i) => ({ i, eng: Math.round(h.engagementScore), att: Math.round(h.attentionScore) }))

  const sessionMins = metricsHistory.length > 0
    ? Math.round(metricsHistory.length * 5 / 60)   // ~5s per tick
    : 0

  return (
    <div className="min-h-screen bg-void p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pulse flex items-center justify-center shadow-glow">
            <span className="text-white font-bold text-sm">IL</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Session Summary</h1>
            {topic
              ? <p className="text-xs text-pulse font-mono">📚 {topic}</p>
              : <p className="text-xs text-text-muted font-mono">General learning session</p>
            }
          </div>
        </div>
        <button
          onClick={() => navigate('/?returning=1')}
          className="btn-ghost text-sm border border-pulse/30 text-pulse hover:bg-pulse/10 px-4 py-1.5 rounded-lg"
        >
          + New Session
        </button>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Avg Engagement', val: `${Math.round(avg(metricsHistory, 'engagementScore'))}%`, color: '#6c63ff', icon: '⚡' },
          { label: 'Avg Attention',  val: `${Math.round(avg(metricsHistory, 'attentionScore'))}%`,  color: '#00d4b5', icon: '👁' },
          { label: 'Interventions',  val: interventions.length, color: '#f59e0b', icon: '🎯' },
          { label: 'Topics Tracked', val: masteryEntries.length || (topic ? 1 : 0), color: '#22c55e', icon: '📚' },
        ].map(({ label, val, color, icon }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="metric-card text-center"
          >
            <div className="text-2xl mb-1">{icon}</div>
            <span className="label-sm block mb-2">{label}</span>
            <span className="text-3xl font-bold font-mono" style={{ color }}>{val}</span>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Radar chart */}
        <div className="metric-card">
          <span className="label-sm block mb-3">Learning Profile</span>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#1e1e3a" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: '#5a5a80', fontSize: 11 }} />
              <Radar
                dataKey="val"
                stroke="#6c63ff"
                fill="#6c63ff"
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend chart */}
        <div className="metric-card col-span-2">
          <div className="flex items-center justify-between mb-3">
            <span className="label-sm">Engagement &amp; Attention Trend</span>
            {sessionMins > 0 && (
              <span className="text-[10px] text-text-muted font-mono">{sessionMins}m session</span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6c63ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6c63ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4b5" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00d4b5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis domain={[0, 100]} tick={{ fill: '#5a5a80', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#111124', border: '1px solid #1e1e3a', borderRadius: 8 }}
                labelStyle={{ color: '#5a5a80' }}
              />
              <Area type="monotone" dataKey="eng" stroke="#6c63ff" strokeWidth={2} fill="url(#engGrad)" dot={false} name="Engagement" />
              <Area type="monotone" dataKey="att" stroke="#00d4b5" strokeWidth={2} fill="url(#attGrad)" dot={false} name="Attention" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Topics mastery */}
        <div className="metric-card">
          <span className="label-sm block mb-3">Topics Studied</span>
          {masteryEntries.length === 0 && topic ? (
            <MasteryBar topic={topic} score={0} />
          ) : masteryEntries.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">No topics tracked yet</p>
          ) : (
            masteryEntries.map(([t, s]) => <MasteryBar key={t} topic={t} score={s} />)
          )}
        </div>

        {/* Intervention log */}
        <div className="metric-card col-span-2">
          <span className="label-sm block mb-3">
            Intervention Log
            {interventions.length > 0 && (
              <span className="ml-2 text-[10px] font-mono bg-pulse/10 text-pulse px-1.5 py-0.5 rounded-full">
                {interventions.length}
              </span>
            )}
          </span>
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
            {interventions.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">No interventions recorded</p>
            ) : (
              interventions.map((item, i) => {
                const cfg = TYPE_LABELS[item.type] || { label: item.type?.replace(/_/g, ' ') ?? 'action', icon: '•', color: '#9090b8' }
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 text-xs py-2 px-2.5 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <span className="text-base flex-shrink-0">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                      {item.message && (
                        <p className="text-text-muted mt-0.5 leading-snug text-[11px]">{item.message}</p>
                      )}
                    </div>
                    {item.timestamp && (
                      <span className="text-[10px] text-text-muted font-mono flex-shrink-0 mt-0.5">
                        {relativeTime(item.timestamp)}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Conversation summary — only show if we have any Q&A */}
        {conversationLog && conversationLog.length > 0 && (
          <div className="metric-card col-span-3">
            <span className="label-sm block mb-3">
              Conversation Replay
              <span className="ml-2 text-[10px] font-mono bg-aurora/10 text-aurora/80 px-1.5 py-0.5 rounded-full">
                {conversationLog.length} messages
              </span>
            </span>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {conversationLog.map((entry, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${entry.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <span className="flex-shrink-0 text-lg mt-0.5">{entry.role === 'ai' ? '🤖' : '👤'}</span>
                  <div
                    className={`max-w-[70%] rounded-xl px-3 py-2 text-xs leading-relaxed border ${
                      entry.role === 'ai'
                        ? 'bg-pulse/10 border-pulse/20 text-text-primary rounded-tl-none'
                        : 'bg-aurora/10 border-aurora/20 text-text-primary rounded-tr-none'
                    }`}
                  >
                    {entry.action && (
                      <span className="block text-[9px] font-mono uppercase tracking-wider mb-0.5 text-pulse/60">
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                    )}
                    {entry.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function avg(history, key) {
  if (!history.length) return 50
  return history.reduce((s, h) => s + (h[key] ?? 50), 0) / history.length
}
