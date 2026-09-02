import { useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { FunnelHoverCard } from '@/components/ui/FunnelHoverCard'
import { ActionTagBadge, StatusBadge } from '@/components/ui/Badge'
import { MetaCtaButton } from '@/components/ui/MetaCtaButton'
import { AdRow } from './AdRow'
import { adsetManagerUrl } from '@/lib/meta-links'
import { MetricTrend, isMetricImproving, MetaFunnelCounts, transformMetaAd } from '@/lib/meta-transform'
import { useAdSetAds } from '@/hooks/useMetaData'

interface AdSet {
  id: string; name: string; audience: string; status: string
  spend: number; roas: number; ctr: number; cpa: number; cpc: number
  impressions: number; clicks: number; conversions: number; frequency: number
  actionTag: string; trend: MetricTrend | null; ads: any[]; adCount?: number; funnel?: MetaFunnelCounts
}

export function AdSetRow({
  adSet, adAccountId, showFunnel = false, isGoogle = false, dateRange = '30D',
}: { adSet: AdSet; adAccountId?: string | null; showFunnel?: boolean; isGoogle?: boolean; dateRange?: string }) {
  const [expanded, setExpanded] = useState(false)
  const metaUrl = adAccountId ? adsetManagerUrl(adAccountId, adSet.id) : null
  const adCount = adSet.adCount ?? adSet.ads.length

  // Live Meta data arrives with adSet.ads already empty (ads are lazy-loaded
  // per ad set now — see useAdSetAds) even though adCount says ads exist.
  // Mock/demo data nests ads directly, so it never hits this path.
  const needsLazyFetch = !isGoogle && adSet.ads.length === 0 && adCount > 0
  const lazy = useAdSetAds(needsLazyFetch && expanded ? adSet.id : null, dateRange)
  const lazyAds = lazy.ads?.map(transformMetaAd).filter((a): a is NonNullable<typeof a> => a !== null) ?? null
  const displayAds = needsLazyFetch ? (lazyAds ?? []) : adSet.ads
  const adsLoading = needsLazyFetch && expanded && lazy.loading

  return (
    <>
      <tr
        className={clsx(
          'cursor-pointer transition-colors',
          expanded ? 'bg-violet-500/5 dark:bg-violet-500/8' : 'hover:bg-surface-2/50'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Ad set level — visually indented with left border accent */}
        <td className="py-2.5 pr-3">
          <div className="flex items-start ml-4 pl-4 border-l-2 border-indigo-500/30">
            <ChevronRight
              size={11}
              className={clsx('t3 transition-transform shrink-0 mt-0.5 mr-2', expanded && 'rotate-90')}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ActionTagBadge tag={adSet.actionTag} />
                <p className="text-xs font-semibold t1">{adSet.name}</p>
                {metaUrl && <MetaCtaButton href={metaUrl} size="xs" />}
              </div>
              <p className="text-[10px] t3 mt-0.5 truncate max-w-[300px]">{adSet.audience}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <StatusBadge status={adSet.status} />
                <span className="text-[10px] t3">{adCount} ads</span>
              </div>
            </div>
          </div>
        </td>

        <td className="px-3 py-2.5 text-right text-xs">
          <p className="font-medium t2">{formatCurrency(adSet.spend)}</p>
          {adSet.trend && <TrendBadge change={adSet.trend.spendPct ?? 0} improving={isMetricImproving('spend', adSet.trend.spendPct ?? 0)} size="sm" />}
        </td>

        <td className="px-3 py-2.5 text-right text-xs">
          <FunnelHoverCard funnel={adSet.funnel}>
            <p className={clsx('font-bold', adSet.roas <= 0 ? 't3' : adSet.roas >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : adSet.roas >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
              {formatRoas(adSet.roas)}
            </p>
          </FunnelHoverCard>
          {adSet.trend && <TrendBadge change={adSet.trend.roasPct ?? 0} improving={isMetricImproving('roas', adSet.trend.roasPct ?? 0)} size="sm" />}
        </td>

        <td className="px-3 py-2.5 text-right text-xs t3">
          {formatPercent(adSet.ctr)}
          {adSet.trend && <div><TrendBadge change={adSet.trend.ctrPct ?? 0} improving={isMetricImproving('ctr', adSet.trend.ctrPct ?? 0)} size="sm" /></div>}
        </td>
        <td className="px-3 py-2.5 text-right text-xs t3">
          {formatCurrency(adSet.cpa)}
          {adSet.trend && <div><TrendBadge change={adSet.trend.cpaPct ?? 0} improving={isMetricImproving('cpa', adSet.trend.cpaPct ?? 0)} size="sm" /></div>}
        </td>
        {showFunnel && (
          isGoogle ? (
            <>
              <td className="px-3 py-2.5 text-right text-xs t3">–</td>
              <td className="px-3 py-2.5 text-right text-xs t3">–</td>
              <td className="px-3 py-2.5 text-right text-xs t3">–</td>
            </>
          ) : (
            <>
              <td className="px-3 py-2.5 text-right text-xs t3">{formatNumber(adSet.funnel?.addToCart ?? 0)}</td>
              <td className="px-3 py-2.5 text-right text-xs t3">{formatNumber(adSet.funnel?.initiateCheckout ?? 0)}</td>
              <td className="px-3 py-2.5 text-right text-xs t3">{formatNumber(adSet.funnel?.addPaymentInfo ?? 0)}</td>
            </>
          )
        )}
      </tr>

      {expanded && (
        adsLoading ? (
          <tr>
            <td colSpan={showFunnel ? 8 : 5} className="py-2.5 pl-16 text-xs t3">
              <Loader2 size={12} className="inline animate-spin mr-1.5" />
              Loading ads…
            </td>
          </tr>
        ) : needsLazyFetch && lazy.error ? (
          <tr>
            <td colSpan={showFunnel ? 8 : 5} className="py-2.5 pl-16 text-xs text-red-500">
              Failed to load ads: {lazy.error}
            </td>
          </tr>
        ) : (
          displayAds.map((ad) => <AdRow key={ad.id} ad={ad} adAccountId={adAccountId} showFunnel={showFunnel} isGoogle={isGoogle} />)
        )
      )}
    </>
  )
}
