/**
 * LatencyGraph — live bar / line chart showing response latencies:
 *   • User response time   (how fast learner answers AI question, ms)
 *   • AI response time     (how fast AI evaluates learner answer, ms)
 *   • Video/content lag    (time-to-first-frame or WS round-trip, ms)
 *
 * Data is sampled whenever a learner turn completes (user_response_ms /
 * ai_response_ms arrive via WebSocket metrics).  A rolling 20-event window
 * is shown so the chart is always meaningful.
 */

import { useEffect, useRef } from 'react'
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useSessionStore } from '../hooks/useSessionStore'

const MAX_POINTS = 20

// Seed data so the chart isn't blank on first render
const SEED = Array.from({ length: 5 }, (_, i) => ({
  i,
  user: 0,
  ai:   0,
}))

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-panel border border-border rounded-lg px-3 py-1.5 text-[10px] font-mono text-text-secondary shadow-panel space-y-0.5">
      <div className="text-text-muted mb-1">Turn #{label + 1}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.fill }}>
          {p.dataKey === 'user' ? '👤 You' : p.dataKey === 'ai' ? '🤖 AI' : '📹 Video'}: {p.value > 0 ? `${p.value} ms` : '—'}
        </div>
      ))}
    </div>
  )
}

export default function LatencyGraph() {
  const metrics = useSessionStore((s) => s.metrics)
  const latencyHistory = useRef([]); // [{i, user, ai}]
  const prevRef = useRef({ user: 0, ai: 0 })

  const { userResponseMs = 0, aiResponseMs = 0 } = metrics

  // Append a new point whenever values change (both become non-zero together)
  useEffect(() => {
    const changed =
      (userResponseMs !== prevRef.current.user && userResponseMs > 0) ||
      (aiResponseMs   !== prevRef.current.ai   && aiResponseMs   > 0)

    if (!changed) return

    prevRef.current = { user: userResponseMs, ai: aiResponseMs }
    latencyHistory.current = [
      ...latencyHistory.current.slice(-(MAX_POINTS - 1)),
      { i: latencyHistory.current.length, user: userResponseMs, ai: aiResponseMs },
    ]
  }, [userResponseMs, aiResponseMs])

  const data = latencyHistory.current.length >= 2
    ? latencyHistory.current
    : SEED

  // Compute averages
  const real = latencyHistory.current
  const avgUser = real.length ? Math.round(real.reduce((s, d) => s + d.user, 0) / real.length) : 0
  const avgAI   = real.length ? Math.round(real.reduce((s, d) => s + d.ai,   0) / real.length) : 0

  return (
    <div className="metric-card">
      <div className="flex items-center justify-between mb-2">
        <span className="label-sm">Response Latency</span>
        <div className="flex items-center gap-3 text-[9px] font-mono text-text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#6c63ff]" />
            You {avgUser > 0 ? `~${avgUser}ms` : ''}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#3ecfcf]" />
            AI {avgAI > 0 ? `~${avgAI}ms` : ''}
          </span>
        </div>
      </div>

      {/* Current snapshot badges */}
      <div className="flex gap-2 mb-2">
        <div className="flex-1 bg-surface/50 rounded-lg px-2 py-1.5 text-center">
          <div className="text-[9px] text-text-muted">Your response</div>
          <div className="text-[13px] font-mono font-semibold text-[#6c63ff]">
            {userResponseMs > 0 ? `${userResponseMs}ms` : '—'}
          </div>
        </div>
        <div className="flex-1 bg-surface/50 rounded-lg px-2 py-1.5 text-center">
          <div className="text-[9px] text-text-muted">AI answer</div>
          <div className="text-[13px] font-mono font-semibold text-[#3ecfcf]">
            {aiResponseMs > 0 ? `${aiResponseMs}ms` : '—'}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={70}>
        <BarChart data={data} margin={{ top: 2, right: 0, left: -32, bottom: 0 }} barGap={2}>
          <XAxis dataKey="i" hide />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="user" fill="#6c63ff" radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={14} />
          <Bar dataKey="ai"   fill="#3ecfcf" radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
