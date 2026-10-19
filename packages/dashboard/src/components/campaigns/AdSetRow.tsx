import { useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { ActionTagBadge, StatusBadge } from '@/components/ui/Badge'
import { MetaCtaButton } from '@/components/ui/MetaCtaButton'
import { AdRow } from './AdRow'
import { MetricCells, METRIC_COLUMN_COUNT } from './MetricCells'
import { adsetManagerUrl } from '@/lib/meta-links'
import { MetricTrend, MetaFunnelCounts, transformMetaAd } from '@/lib/meta-transform'
import { useAdSetAds } from '@/hooks/useMetaData'

interface AdSet {
  id: string; name: string; audience: string; status: string
  spend: number; roas: number; ctr: number; cpa: number; cpc: number
  impressions: number; clicks: number; conversions: number; frequency: number
  actionTag: string; trend: MetricTrend | null; ads: any[]; adCount?: number | null; funnel?: MetaFunnelCounts
  results?: number; resultLabel?: string; costPerResult?: number
}

export function AdSetRow({
  adSet, adAccountId, showFunnel = false, isGoogle = false, dateRange = '30D',
}: { adSet: AdSet; adAccountId?: string | null; showFunnel?: boolean; isGoogle?: boolean; dateRange?: string }) {
  const [expanded, setExpanded] = useState(false)
  const metaUrl = adAccountId ? adsetManagerUrl(adAccountId, adSet.id) : null
  const adCount = adSet.adCount === null ? null : adSet.adCount ?? adSet.ads.length

  // Live Meta data arrives with adSet.ads already empty (ads are lazy-loaded
  // per ad set now — see useAdSetAds) even though adCount says ads exist.
  // Mock/demo data nests ads directly, so it never hits this path.
  const needsLazyFetch = !isGoogle && adSet.ads.length === 0 && adCount !== 0
  const lazy = useAdSetAds(needsLazyFetch && expanded ? adSet.id : null, dateRange)
  const lazyAds = lazy.ads?.map(transformMetaAd).filter((a): a is NonNullable<typeof a> => a !== null) ?? null
  const displayAds = needsLazyFetch ? (lazyAds ?? []) : adSet.ads
  const adsLoading = needsLazyFetch && expanded && lazy.loading
  const colSpan = METRIC_COLUMN_COUNT + (showFunnel ? 3 : 0)

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
                <span className="text-[10px] t3">{adCount === null ? 'Ads' : `${adCount} ads`}</span>
              </div>
            </div>
          </div>
        </td>

        <MetricCells m={adSet} level="adset" showFunnel={showFunnel} isGoogle={isGoogle} />
      </tr>

      {expanded && (
        adsLoading ? (
          <tr>
            <td colSpan={colSpan} className="py-2.5 pl-16 text-xs t3">
              <Loader2 size={12} className="inline animate-spin mr-1.5" />
              Loading ads…
            </td>
          </tr>
        ) : needsLazyFetch && lazy.error ? (
          <tr>
            <td colSpan={colSpan} className="py-2.5 pl-16 text-xs text-red-500">
              Failed to load ads: {lazy.error}
              <button onClick={(e) => { e.stopPropagation(); lazy.retry() }} className="ml-2 font-semibold underline hover:text-red-600">Retry</button>
            </td>
          </tr>
        ) : (
          <>
          {needsLazyFetch && lazy.partial && displayAds.length > 0 && (
            <tr><td colSpan={colSpan} className="py-1 pl-16 text-[11px] text-amber-600 dark:text-amber-400">Meta is limiting reads on this account — showing ad names and metrics; status and thumbnails unavailable for now.</td></tr>
          )}
          {displayAds.map((ad) => <AdRow key={ad.id} ad={ad} adAccountId={adAccountId} showFunnel={showFunnel} isGoogle={isGoogle} />)}
          </>
        )
      )}
    </>
  )
}
