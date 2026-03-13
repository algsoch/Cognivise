/**
 * MonitoringScopeCard — transparent view of what signals are monitored live.
 */

import { useSessionStore } from '../hooks/useSessionStore'

function Badge({ label, ok }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border ${
        ok
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
          : 'border-border bg-surface/60 text-text-muted'
      }`}
    >
      {label}
    </span>
  )
}

export default function MonitoringScopeCard({
  title = 'Monitoring Scope',
  compact = false,
  onOpenInspector = null,
  engineLabel = 'groq',
}) {
  const metrics = useSessionStore((s) => s.metrics)
  const freshness = useSessionStore((s) => s.signalFreshness)
  const learnerSpeech = useSessionStore((s) => s.learnerSpeech)
  const agentSpeech = useSessionStore((s) => s.agentSpeech)
  const agentTranscript = useSessionStore((s) => s.agentTranscript)

  const aiSpoken = (agentTranscript || agentSpeech || '').trim()
  const userSpoken = (learnerSpeech || '').trim()
  const now = Date.now()
  const frameAge = freshness.frameAt ? Math.max(0, Math.round((now - freshness.frameAt) / 1000)) : null
  const learnerAge = freshness.learnerSpeechAt ? Math.max(0, Math.round((now - freshness.learnerSpeechAt) / 1000)) : null
  const aiAge = freshness.agentSpeechAt ? Math.max(0, Math.round((now - freshness.agentSpeechAt) / 1000)) : null
  const syncScore = (() => {
    if (metrics.speakingDetected && learnerAge !== null && learnerAge <= 8) return 92
    if (metrics.speakingDetected && (learnerAge === null || learnerAge > 8)) return 48
    if (!metrics.speakingDetected && learnerAge !== null && learnerAge <= 8) return 42
    return 72
  })()

  return (
    <div className="glass rounded-xl border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
          {title}
        </span>
        <span className="text-[10px] text-text-muted font-mono">
          frame {metrics.frameHash || '---'}
        </span>
      </div>

      <div className="flex items-center justify-between mb-2 text-[10px]">
        <span className="text-text-muted">Engine: <span className="text-text-primary uppercase font-mono">{engineLabel}</span></span>
        <span className="text-text-muted">Sync <span className="text-text-primary font-mono">{syncScore}%</span></span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">Frame age <span className="text-text-primary font-mono">{frameAge == null ? '--' : `${frameAge}s`}</span></div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">You age <span className="text-text-primary font-mono">{learnerAge == null ? '--' : `${learnerAge}s`}</span></div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">AI age <span className="text-text-primary font-mono">{aiAge == null ? '--' : `${aiAge}s`}</span></div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <Badge label="Face" ok={!!metrics.faceDetected} />
        <Badge label="Gaze" ok={!!metrics.gazeOnScreen} />
        <Badge label="Audio In" ok={userSpoken.length > 0} />
        <Badge label="Audio Out" ok={aiSpoken.length > 0} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">
          FPS <span className="text-pulse font-mono">{metrics.frameFps || 0}</span>
        </div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">
          People <span className="text-text-primary font-mono">{metrics.peopleCount ?? 0}</span>
        </div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">
          Gaze <span className="text-text-primary capitalize">{metrics.gazeDirection || 'center'}</span>
        </div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">
          Blink/min <span className="text-text-primary font-mono">{Number(metrics.blinkRate || 0).toFixed(1)}</span>
        </div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">
          Mouth <span className="text-text-primary font-mono">{Number(metrics.mouthOpenRatio || 0).toFixed(2)}</span>
        </div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">
          Mouth mv <span className="text-text-primary font-mono">{Number(metrics.mouthMovement || 0).toFixed(2)}</span>
        </div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">
          Speaking <span className="text-text-primary">{metrics.speakingDetected ? 'yes' : 'no'}</span>
        </div>
        <div className="bg-surface/50 border border-border/50 rounded px-2 py-1">
          Tongue <span className="text-text-primary">{metrics.tongueVisible ? 'visible' : 'low'}</span>
        </div>
      </div>

      {!compact && (
        <>
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">You said</div>
          <div className="text-[11px] text-text-primary bg-aurora/10 border border-aurora/20 rounded px-2 py-1.5 mb-2 line-clamp-2">
            {userSpoken || 'No recent speech captured yet'}
          </div>

          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">AI said</div>
          <div className="text-[11px] text-text-primary bg-pulse/10 border border-pulse/20 rounded px-2 py-1.5 line-clamp-2">
            {aiSpoken || 'No recent AI speech captured yet'}
          </div>
        </>
      )}

      {onOpenInspector && (
        <button
          onClick={onOpenInspector}
          className="mt-2 w-full text-xs px-3 py-1.5 rounded-lg border border-pulse/30 text-pulse hover:bg-pulse/10 transition-all"
        >
          Open Monitoring Inspector
        </button>
      )}
    </div>
  )
}
