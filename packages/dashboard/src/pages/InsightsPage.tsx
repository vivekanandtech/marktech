import { useEffect, useState } from 'react'
import {
  Sparkles, RefreshCw, Loader2, TrendingUp, Wrench, ShieldAlert,
  Image, PieChart, MapPin, CheckCircle2, XCircle, RotateCcw, ChevronDown,
} from 'lucide-react'
import clsx from 'clsx'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { MetricInfoTooltip } from '@/components/ui/MetricInfoTooltip'
import {
  useCrossChannelInsightsStore, RankedRecommendation, RecommendationCategory,
} from '@/store/crossChannelInsightsStore'

const CATEGORY_CONFIG: Record<RecommendationCategory, { icon: typeof TrendingUp; label: string; classes: string }> = {
  scale:     { icon: TrendingUp,  label: 'Scale',     classes: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  fix:       { icon: Wrench,      label: 'Fix',       classes: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30' },
  tracking:  { icon: ShieldAlert, label: 'Tracking',  classes: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' },
  creative:  { icon: Image,       label: 'Creative',  classes: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30' },
  budget:    { icon: PieChart,    label: 'Budget',    classes: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  geography: { icon: MapPin,      label: 'Geography', classes: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30' },
}

const CONFIDENCE_LABEL: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }
const EFFORT_LABEL: Record<string, string> = { low: 'Low effort', medium: 'Medium effort', high: 'High effort' }

function StatusActions({ rec, clientId }: { rec: RankedRecommendation; clientId: string }) {
  const updateStatus = useCrossChannelInsightsStore((s) => s.updateStatus)
  if (rec.status === 'new') {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => updateStatus(clientId, rec.rank, 'done')}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <CheckCircle2 size={11} /> Mark as done
        </button>
        <button
          onClick={() => updateStatus(clientId, rec.rank, 'dismissed')}
          className="flex items-center gap-1.5 text-[11px] font-semibold t3 hover:t1 transition-colors"
        >
          <XCircle size={11} /> Dismiss
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); updateStatus(clientId, rec.rank, 'new') }}
      className="flex items-center gap-1.5 text-[11px] font-semibold t3 hover:t1 transition-colors"
    >
      <RotateCcw size={11} /> Reset
    </button>
  )
}

function EvidenceBody({ rec }: { rec: RankedRecommendation }) {
  return (
    <>
      <p className="text-xs t2 leading-relaxed">{rec.evidence}</p>
      <p className="text-xs t3 italic mt-1.5">{rec.expectedImpact}</p>
      {rec.sourceEntity?.platform && (
        <a
          href={rec.sourceEntity.platform === 'meta' ? '/meta' : rec.sourceEntity.platform === 'google' ? '/google' : '/shopify'}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold t2 hover:t1 border border-theme rounded-lg px-2.5 py-1.5 mt-2.5 transition-colors"
        >
          View in {rec.sourceEntity.platform === 'meta' ? 'Meta Ads' : rec.sourceEntity.platform === 'google' ? 'Google Ads' : 'Shopify'}
        </a>
      )}
    </>
  )
}

// The single most important finding — always fully visible, visually distinct
// from the rest so a glance at the page tells you what matters most first.
function HeroCard({ rec, clientId }: { rec: RankedRecommendation; clientId: string }) {
  const cfg = CATEGORY_CONFIG[rec.category]
  const Icon = cfg.icon
  const dismissed = rec.status === 'dismissed'

  return (
    <div className={clsx(
      'relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-600/10 via-violet-600/5 to-transparent p-5',
      dismissed && 'opacity-50'
    )}>
      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Top priority</span>
        <span className={clsx('flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border', cfg.classes)}>
          <Icon size={11} /> {cfg.label}
        </span>
        <span className="text-[10px] t3">{CONFIDENCE_LABEL[rec.confidence]} · {EFFORT_LABEL[rec.effort]}</span>
        {rec.status === 'done' && (
          <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">Done</span>
        )}
      </div>

      <div className="flex items-start gap-2">
        <h2 className="text-base font-bold t1">{rec.title}</h2>
        {rec.sourceMetricId && <MetricInfoTooltip metricId={rec.sourceMetricId} size="sm" />}
      </div>

      <div className="mt-2">
        <EvidenceBody rec={rec} />
      </div>

      <div className="mt-3">
        <StatusActions rec={rec} clientId={clientId} />
      </div>
    </div>
  )
}

// Everything below rank 1 — compact, collapsed by default, so the page reads
// as a scannable list rather than eight equally-loud walls of text.
function CompactRow({ rec, clientId }: { rec: RankedRecommendation; clientId: string }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = CATEGORY_CONFIG[rec.category]
  const Icon = cfg.icon
  const dismissed = rec.status === 'dismissed'

  return (
    <div className={clsx('card overflow-hidden', dismissed && 'opacity-50')}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-[11px] font-bold t3 w-5 shrink-0">{rec.rank}</span>
        <Icon size={14} className={clsx('shrink-0', cfg.classes.split(' ')[0])} />
        <span className="flex-1 min-w-0 text-xs font-semibold t1 truncate">{rec.title}</span>
        {rec.status === 'done' && (
          <span className="text-[10px] font-semibold text-emerald-500 shrink-0">Done</span>
        )}
        <ChevronDown size={14} className={clsx('t3 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-12 -mt-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] t3">{CONFIDENCE_LABEL[rec.confidence]} · {EFFORT_LABEL[rec.effort]}</span>
            {rec.sourceMetricId && <MetricInfoTooltip metricId={rec.sourceMetricId} size="sm" />}
          </div>
          <EvidenceBody rec={rec} />
          <div className="mt-3">
            <StatusActions rec={rec} clientId={clientId} />
          </div>
        </div>
      )}
    </div>
  )
}

export function InsightsPage() {
  const clientId = useFilterStore((s) => s.clientId)
  const dateRange = useFilterStore((s) => s.dateRange)
  const { clients } = useClientStore()
  const { payload, loading, error, fetchedForClient, fetchLatest, generate } = useCrossChannelInsightsStore()

  const currentClient = clients.find((c) => c.id === clientId)
  const connectedSomewhere = !!(currentClient?.meta.connected || currentClient?.shopify.connected || currentClient?.google?.connected)

  useEffect(() => {
    if (connectedSomewhere && fetchedForClient !== clientId) fetchLatest(clientId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, connectedSomewhere])

  const recommendations = payload?.recommendations ?? []
  const [hero, ...rest] = recommendations

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold t1 flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-500" /> Insights
          </h1>
          <p className="text-sm t3 mt-0.5">
            Ranked, cross-channel recommendations — Meta and Google claims reconciled against Shopify truth.
          </p>
        </div>
        <button
          onClick={() => generate(clientId, dateRange)}
          disabled={!connectedSomewhere || loading}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {recommendations.length > 0 ? 'Regenerate' : 'Generate insights'}
        </button>
      </div>

      {payload?.generatedAt && (
        <p className="text-[11px] t3 -mt-3">
          Last generated {new Date(payload.generatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} for the {payload.dateRange} window
        </p>
      )}

      {!connectedSomewhere && (
        <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Sparkles size={28} className="t3" />
          <p className="t2 text-sm max-w-sm">Connect Meta, Google, or Shopify to generate cross-channel recommendations.</p>
        </div>
      )}

      {connectedSomewhere && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">{error}</div>
      )}

      {connectedSomewhere && loading && recommendations.length === 0 && (
        <div className="flex items-center gap-2 text-sm t3 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> Analyzing your account…
        </div>
      )}

      {connectedSomewhere && !loading && recommendations.length === 0 && !error && (
        <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Sparkles size={28} className="t3 opacity-40" />
          <p className="t2 text-sm max-w-sm">Click "Generate insights" to get ranked, cross-channel recommendations for this account.</p>
        </div>
      )}

      {hero && (
        <div className="space-y-2">
          <HeroCard rec={hero} clientId={clientId} />
          {rest.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {rest.map((rec) => <CompactRow key={rec.rank} rec={rec} clientId={clientId} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
