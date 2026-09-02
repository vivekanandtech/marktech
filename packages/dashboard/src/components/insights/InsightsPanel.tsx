import { Sparkles, AlertOctagon, AlertTriangle, TrendingUp, Lightbulb, RefreshCw, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { useInsightsStore, InsightSeverity, InsightsPayload } from '@/store/insightsStore'
import { MetaCtaButton } from '@/components/ui/MetaCtaButton'
import { campaignManagerUrl, adManagerUrl } from '@/lib/meta-links'

const SEVERITY_CONFIG: Record<InsightSeverity, { icon: typeof AlertOctagon; classes: string }> = {
  critical:    { icon: AlertOctagon,  classes: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30' },
  warning:     { icon: AlertTriangle, classes: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' },
  opportunity: { icon: TrendingUp,    classes: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  info:        { icon: Lightbulb,    classes: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
}

export function InsightsPanel({ payload, adAccountId }: { payload: InsightsPayload | null; adAccountId?: string | null }) {
  const { insights, loading, error, lastGeneratedAt, generate } = useInsightsStore()

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-600/10 via-violet-600/5 to-transparent p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/30">
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold t1">AI Insights</h3>
            <p className="text-[11px] t3">
              {lastGeneratedAt
                ? `Generated ${new Date(lastGeneratedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · powered by GPT`
                : 'Real recommendations from your actual account data — not templated rules'}
            </p>
          </div>
        </div>
        <button
          onClick={() => payload && generate(payload)}
          disabled={!payload || loading}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {insights.length > 0 ? 'Refresh insights' : 'Generate AI insights'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500 mb-2">
          Couldn't generate insights: {error}
        </div>
      )}

      {loading && insights.length === 0 ? (
        <div className="flex items-center gap-2 text-xs t3 py-6 justify-center">
          <Loader2 size={14} className="animate-spin" /> Analyzing your account…
        </div>
      ) : insights.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Sparkles size={20} className="t3 opacity-40" />
          <p className="text-xs t3">Click "Generate AI insights" to get prioritized, specific recommendations for this account.</p>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-2 pr-1
          [&::-webkit-scrollbar]:w-1
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb]:bg-indigo-400/40
          dark:[&::-webkit-scrollbar-thumb]:bg-indigo-400/25">
          {insights.map((insight, i) => {
            const cfg = SEVERITY_CONFIG[insight.severity]
            const Icon = cfg.icon
            const ctaHref = !insight.entityId || !adAccountId ? null
              : insight.entityType === 'campaign' ? campaignManagerUrl(adAccountId, insight.entityId)
              : insight.entityType === 'creative' ? adManagerUrl(adAccountId, insight.entityId)
              : null
            return (
              <div key={i} className={clsx('flex items-start gap-3 rounded-lg border p-3 backdrop-blur-sm', cfg.classes)}>
                <Icon size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold t1">{insight.title}</p>
                  <p className="text-xs t2 mt-0.5">{insight.message}</p>
                  <p className="text-xs t3 mt-1 italic">{insight.recommendation}</p>
                </div>
                {ctaHref && <MetaCtaButton href={ctaHref} label="View in Meta" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
