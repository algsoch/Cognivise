/**
 * AgentStatusBar — top bar showing agent connection + session info.
 */

import { motion } from 'framer-motion'
import { useSessionStore } from '../hooks/useSessionStore'
import LearnerStateTag from './LearnerStateTag'

function Dot({ status }) {
  const colors = {
    disconnected: '#ef4444',
    connecting: '#f59e0b',
    connected: '#22c55e',
  }
  return (
    <span
      className={`w-2 h-2 rounded-full ${status === 'connected' ? 'animate-pulse-slow' : ''}`}
      style={{ background: colors[status] || colors.disconnected }}
    />
  )
}

function ElapsedTime({ startedAt }) {
  const [, forceUpdate] = React.useState(0)
  React.useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const secs = Math.floor((Date.now() - startedAt) / 1000)
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return <span className="font-mono text-text-muted text-xs">{m}:{s}</span>
}

import React from 'react'

export default function AgentStatusBar() {
  const { agentStatus, topic, sessionStartedAt, isInSession } = useSessionStore()
  const learnerState = useSessionStore((s) => s.metrics.learnerState)

  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border glass">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-pulse flex items-center justify-center shadow-glow">
          <span className="text-white text-xs font-bold">IL</span>
        </div>
        <span className="font-semibold text-text-primary tracking-tight">
          Intelligent Learn
        </span>
      </div>

      {/* Centre — topic + timer */}
      <div className="flex items-center gap-4">
        {topic && (
          <span className="text-sm text-text-secondary">
            <span className="text-text-muted text-xs font-mono mr-1">TOPIC</span>
            {topic}
          </span>
        )}
        {isInSession && sessionStartedAt && (
          <ElapsedTime startedAt={sessionStartedAt} />
        )}
      </div>

      {/* Right — state + agent status */}
      <div className="flex items-center gap-4">
        <LearnerStateTag state={learnerState} />
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Dot status={agentStatus} />
          <span className="capitalize">{agentStatus}</span>
        </div>
      </div>
    </div>
  )
}
