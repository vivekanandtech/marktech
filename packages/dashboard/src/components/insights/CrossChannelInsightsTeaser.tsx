import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight, TrendingUp, Wrench, ShieldAlert, Image, PieChart, MapPin } from 'lucide-react'
import clsx from 'clsx'
import { useCrossChannelInsightsStore, RecommendationCategory } from '@/store/crossChannelInsightsStore'

const CATEGORY_ICON: Record<RecommendationCategory, typeof TrendingUp> = {
  scale: TrendingUp, fix: Wrench, tracking: ShieldAlert, creative: Image, budget: PieChart, geography: MapPin,
}

// Homepage teaser for the dedicated Insights page — shows the top 3 ranked
// cross-channel recommendations without duplicating the full list (with
// status actions, drawer links, etc.) here. See InsightsPage.tsx for that.
export function CrossChannelInsightsTeaser({ clientId }: { clientId: string }) {
  const { payload, fetchedForClient, fetchLatest } = useCrossChannelInsightsStore()

  useEffect(() => {
    if (fetchedForClient !== clientId) fetchLatest(clientId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const top3 = (payload?.recommendations ?? []).filter((r) => r.status !== 'dismissed').slice(0, 3)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-600/10 via-violet-600/5 to-transparent p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/30">
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold t1">Cross-Channel Insights</h3>
            <p className="text-[11px] t3">Meta + Google reconciled against Shopify truth</p>
          </div>
        </div>
        <Link
          to="/insights"
          className="flex items-center gap-1 text-xs font-semibold text-indigo-500 dark:text-indigo-400 hover:underline"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      {top3.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Sparkles size={20} className="t3 opacity-40" />
          <p className="text-xs t3">No recommendations generated yet.</p>
          <Link to="/insights" className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 hover:underline">
            Generate on the Insights page →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {top3.map((rec) => {
            const Icon = CATEGORY_ICON[rec.category]
            return (
              <Link
                key={rec.rank}
                to="/insights"
                className={clsx(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-surface-2',
                  'border-theme'
                )}
              >
                <Icon size={16} className="shrink-0 mt-0.5 t3" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold t1">{rec.title}</p>
                  <p className="text-xs t3 mt-0.5 line-clamp-1">{rec.expectedImpact}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
