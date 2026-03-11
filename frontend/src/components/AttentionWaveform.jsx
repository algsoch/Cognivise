/**
 * AttentionWaveform — live scrolling triple-line chart:
 *   • Attention score      (purple line)
 *   • Engagement score     (teal line)
 *   • Cognitive load score (amber line)
 *
 * Pre-seeds with neutral values so the chart is visible from the first second,
 * not stuck on "Waiting for signal…"
 */

import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { useSessionStore } from '../hooks/useSessionStore'

const NEUTRAL_SEED = Array.from({ length: 10 }, (_, i) => ({
  i,
  attention:  50,
  engagement: 50,
  cogLoad:    35,
}))

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const labels = { attention: '👁 Attn', engagement: '⚡ Eng', cogLoad: '🧠 CogLoad' }
  return (
    <div className="bg-panel border border-border rounded-lg px-3 py-1.5 text-[10px] font-mono text-text-secondary shadow-panel space-y-0.5">
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.stroke }}>
          {labels[p.dataKey] ?? p.dataKey}: {Math.round(p.value)}
        </div>
      ))}
    </div>
  )
}

export default function AttentionWaveform() {
  const history = useSessionStore((s) => s.metricsHistory)

  // Map real history; mix with seed if fewer than 2 real points so chart always renders
  const realData = history.slice(-60).map((h, i) => ({
    i,
    attention:  h.attentionScore      ?? 50,
    engagement: h.engagementScore     ?? 50,
    cogLoad:    h.cognitiveLoadScore  ?? 35,
  }))

  const data = realData.length >= 2 ? realData : [
    ...NEUTRAL_SEED.slice(0, Math.max(0, 10 - realData.length)),
    ...realData,
  ].map((d, i) => ({ ...d, i }))

  return (
    <div className="metric-card">
      <div className="flex items-center justify-between mb-3">
        <span className="label-sm">Attention · Engagement · CogLoad</span>
        <div className="flex items-center gap-3 text-[9px] font-mono text-text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-[2px] bg-[#6c63ff] rounded" />
            Attn
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-[2px] bg-[#3ecfcf] rounded" />
            Eng
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-[2px] bg-[#f59e0b] rounded" />
            CogLoad
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
          <defs>
            <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6c63ff" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#6c63ff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3ecfcf" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#3ecfcf" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cogGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.20} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 100]} hide />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="cogLoad"
            stroke="#f59e0b"
            strokeWidth={1.5}
            fill="url(#cogGrad)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="engagement"
            stroke="#3ecfcf"
            strokeWidth={1.5}
            fill="url(#engGrad)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="attention"
            stroke="#6c63ff"
            strokeWidth={2}
            fill="url(#attGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
