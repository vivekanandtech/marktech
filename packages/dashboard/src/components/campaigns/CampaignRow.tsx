import { useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { FunnelHoverCard } from '@/components/ui/FunnelHoverCard'
import { ActionTagBadge, StatusBadge } from '@/components/ui/Badge'
import { MetaCtaButton } from '@/components/ui/MetaCtaButton'
import { AdSetRow } from './AdSetRow'
import { useCampaignDetail } from '@/hooks/useMetaData'
import { useGoogleAdGroups } from '@/hooks/useGoogleData'
import { useFilterStore } from '@/store/filterStore'
import { transformMetaAdSet, MetricTrend, isMetricImproving, MetaFunnelCounts } from '@/lib/meta-transform'
import { transformGoogleAdGroup } from '@/lib/google-transform'
import { useInsightsStore } from '@/store/insightsStore'
import { campaignManagerUrl } from '@/lib/meta-links'

interface Campaign {
  id: string; platform: string; name: string; type: string; market: string; status: string; objective: string
  dailyBudget: number; spend: number; roas: number; ctr: number; cpa: number; cpc: number
  impressions: number; clicks: number; conversions: number; reach: number; frequency: number
  actionTag: string; trend: MetricTrend | null; adSets: any[]; funnel?: MetaFunnelCounts
}

const INSIGHT_TEXT_CLASS: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  opportunity: 'text-emerald-600 dark:text-emerald-400',
  info: 'text-indigo-600 dark:text-indigo-400',
}

export function CampaignRow({ campaign, adAccountId, showFunnel = false }: { campaign: Campaign; adAccountId?: string | null; showFunnel?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const { dateRange } = useFilterStore()
  const isGoogle = campaign.platform === 'google'

  const insight = useInsightsStore((s) => s.getForEntity('campaign', campaign.id))
  const metaUrl = !isGoogle && adAccountId ? campaignManagerUrl(adAccountId, campaign.id) : null

  // Lazy-load ad sets only when the row is expanded — avoids fetching all
  // ad sets/ads for 800+ campaigns upfront. Only attempted for live (connected)
  // campaigns — adAccountId is absent in mock/demo mode, where campaign.adSets
  // already holds the static nested data and needs no fetch.
  // Both hooks are called unconditionally (rules of hooks) — only the one
  // matching this campaign's platform is given a real id to fetch with.
  const meta = useCampaignDetail(
    !isGoogle && expanded && adAccountId ? campaign.id : null,
    dateRange
  )
  const google = useGoogleAdGroups(isGoogle && expanded ? campaign.id : null)

  const loadingDetail = isGoogle ? google.loading : meta.loading
  const detailError = isGoogle ? google.error : meta.error

  // Transform raw platform-specific adset/ad-group objects → the shape
  // AdSetRow expects. campaign.adSets is always [] (we lazy-load); the raw
  // data above only appears once the row is expanded.
  const transformedAdSets = isGoogle
    ? (google.adGroups.length > 0 ? google.adGroups.map(transformGoogleAdGroup) : campaign.adSets)
    : (meta.adSets ? meta.adSets.map(transformMetaAdSet).filter(Boolean) : campaign.adSets)
  const displayAdSets = transformedAdSets

  // Meta's hook starts at `adSets: null` (so "loading, nothing yet" is a clean
  // null-check); Google's starts at `adGroups: []` (same shape as "loaded but
  // empty"). Normalize both into one "still loading, nothing to show" check.
  const stillLoadingDetail = loadingDetail && displayAdSets.length === 0

  return (
    <>
      <tr
        className={clsx(
          'border-b border-theme cursor-pointer transition-colors group',
          expanded ? 'bg-indigo-500/5 dark:bg-indigo-500/8' : 'hover:bg-surface-2/70'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="pl-4 pr-3 py-3">
          <div className="flex items-start gap-2.5">
            <span className={clsx(
              'flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold shrink-0 mt-0.5',
              campaign.platform === 'meta'
                ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            )}>
              {campaign.platform === 'meta' ? 'M' : 'G'}
            </span>

            <ChevronRight
              size={14}
              className={clsx('t3 transition-transform shrink-0 mt-1', expanded && 'rotate-90')}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ActionTagBadge tag={campaign.actionTag} />
                <p className="text-sm font-semibold t1">{campaign.name}</p>
                {metaUrl && <MetaCtaButton href={metaUrl} size="xs" />}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <StatusBadge status={campaign.status} />
                <span className="text-[10px] t3">
                  {loadingDetail ? '…' : `${displayAdSets.length} ad sets`} · {formatCurrency(campaign.dailyBudget)}/day
                </span>
              </div>
              {insight && (
                <p className={clsx('text-[10px] mt-1', INSIGHT_TEXT_CLASS[insight.severity])}>
                  💡 {insight.message} {insight.recommendation}
                </p>
              )}
            </div>
          </div>
        </td>

        <td className="px-3 py-3 text-right">
          <p className="text-sm font-semibold t1">{formatCurrency(campaign.spend)}</p>
          {campaign.trend && <TrendBadge change={campaign.trend.spendPct ?? 0} improving={isMetricImproving('spend', campaign.trend.spendPct ?? 0)} />}
        </td>

        <td className="px-3 py-3 text-right">
          <FunnelHoverCard funnel={campaign.funnel}>
            <p className={clsx(
              'text-sm font-bold',
              campaign.roas <= 0 ? 't3' : campaign.roas >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : campaign.roas >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
            )}>
              {formatRoas(campaign.roas)}
            </p>
          </FunnelHoverCard>
          {campaign.trend && <TrendBadge change={campaign.trend.roasPct ?? 0} improving={isMetricImproving('roas', campaign.trend.roasPct ?? 0)} />}
        </td>

        <td className="px-3 py-3 text-right text-sm t2">
          {formatPercent(campaign.ctr)}
          {campaign.trend && <div><TrendBadge change={campaign.trend.ctrPct ?? 0} improving={isMetricImproving('ctr', campaign.trend.ctrPct ?? 0)} /></div>}
        </td>
        <td className="px-3 py-3 text-right text-sm t2">
          {formatCurrency(campaign.cpa)}
          {campaign.trend && <div><TrendBadge change={campaign.trend.cpaPct ?? 0} improving={isMetricImproving('cpa', campaign.trend.cpaPct ?? 0)} /></div>}
        </td>
        {showFunnel && (
          isGoogle ? (
            <>
              <td className="px-3 py-3 text-right text-sm t3">–</td>
              <td className="px-3 py-3 text-right text-sm t3">–</td>
              <td className="px-3 py-3 text-right text-sm t3">–</td>
            </>
          ) : (
            <>
              <td className="px-3 py-3 text-right text-sm t2">{formatNumber(campaign.funnel?.addToCart ?? 0)}</td>
              <td className="px-3 py-3 text-right text-sm t2">{formatNumber(campaign.funnel?.initiateCheckout ?? 0)}</td>
              <td className="px-3 py-3 text-right text-sm t2">{formatNumber(campaign.funnel?.addPaymentInfo ?? 0)}</td>
            </>
          )
        )}
      </tr>

      {expanded && (
        stillLoadingDetail ? (
          <tr>
            <td colSpan={showFunnel ? 8 : 5} className="py-3 pl-12 text-xs t3">
              <Loader2 size={12} className="inline animate-spin mr-1.5" />
              Loading ad sets…
            </td>
          </tr>
        ) : detailError ? (
          <tr>
            <td colSpan={showFunnel ? 8 : 5} className="py-3 pl-12 text-xs text-red-500">
              Failed to load: {detailError}
            </td>
          </tr>
        ) : displayAdSets.length === 0 ? (
          <tr>
            <td colSpan={showFunnel ? 8 : 5} className="py-3 pl-12 text-xs t3">No ad sets found for this campaign.</td>
          </tr>
        ) : (
          displayAdSets.map((adSet: any) => <AdSetRow key={adSet.id} adSet={adSet} adAccountId={isGoogle ? null : adAccountId} showFunnel={showFunnel} isGoogle={isGoogle} dateRange={dateRange} />)
        )
      )}
    </>
  )
}
