/**
 * AttentionWaveform — live scrolling attention score as a sparkline.
 */

import { useRef } from 'react'
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { useSessionStore } from '../hooks/useSessionStore'

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-panel border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-text-secondary shadow-panel">
      {Math.round(payload[0].value)}
    </div>
  )
}

export default function AttentionWaveform() {
  const history = useSessionStore((s) => s.metricsHistory)
  const data = history.slice(-60).map((h, i) => ({
    i,
    attention: h.attentionScore ?? 50,
  }))

  if (data.length < 2) {
    return (
      <div className="metric-card">
        <span className="label-sm block mb-3">Attention Waveform</span>
        <div className="h-[80px] flex items-center justify-center text-text-muted text-sm">
          Waiting for signal…
        </div>
      </div>
    )
  }

  return (
    <div className="metric-card">
      <span className="label-sm block mb-3">Attention Waveform</span>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
          <defs>
            <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6c63ff" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#6c63ff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 100]} hide />
          <Tooltip content={<CustomTooltip />} />
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
