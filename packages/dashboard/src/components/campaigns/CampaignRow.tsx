import { useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency, formatRoas, formatPercent } from '@/lib/formatters'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { ActionTagBadge, CampaignTypeBadge, MarketBadge, StatusBadge } from '@/components/ui/Badge'
import { AdSetRow } from './AdSetRow'
import { useCampaignDetail } from '@/hooks/useMetaData'
import { useFilterStore } from '@/store/filterStore'
import { transformMetaAdSet } from '@/lib/meta-transform'

interface Campaign {
  id: string; platform: string; name: string; type: string; market: string; status: string; objective: string
  dailyBudget: number; spend: number; roas: number; ctr: number; cpa: number; cpc: number
  impressions: number; clicks: number; conversions: number; reach: number; frequency: number
  actionTag: string; trend: number; adSets: any[]
}

export function CampaignRow({ campaign }: { campaign: Campaign }) {
  const [expanded, setExpanded] = useState(false)
  const { dateRange } = useFilterStore()

  // Lazy-load ad sets only when the row is expanded — avoids fetching all
  // ad sets/ads for 800+ campaigns upfront.
  const { adSets, loading: loadingDetail, error: detailError } = useCampaignDetail(
    expanded ? campaign.id : null,
    dateRange
  )

  // Transform raw Meta API adset objects → the shape AdSetRow expects.
  // campaign.adSets is always [] (we lazy-load); adSets come from useCampaignDetail raw.
  const transformedAdSets = adSets
    ? adSets.map(transformMetaAdSet).filter(Boolean)
    : campaign.adSets
  const displayAdSets = transformedAdSets

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
                <p className="text-sm font-semibold t1">{campaign.name}</p>
                <ActionTagBadge tag={campaign.actionTag} />
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <CampaignTypeBadge type={campaign.type} />
                <MarketBadge market={campaign.market} />
                <StatusBadge status={campaign.status} />
                <span className="text-[10px] t3">
                  {loadingDetail ? '…' : `${displayAdSets.length} ad sets`} · {formatCurrency(campaign.dailyBudget)}/day
                </span>
              </div>
            </div>
          </div>
        </td>

        <td className="px-3 py-3 text-right">
          <p className="text-sm font-semibold t1">{formatCurrency(campaign.spend)}</p>
        </td>

        <td className="px-3 py-3 text-right">
          <p className={clsx(
            'text-sm font-bold',
            campaign.roas <= 0 ? 't3' : campaign.roas >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : campaign.roas >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
          )}>
            {formatRoas(campaign.roas)}
          </p>
        </td>

        <td className="px-3 py-3 text-right text-sm t2">{formatPercent(campaign.ctr)}</td>
        <td className="px-3 py-3 text-right text-sm t2">{formatCurrency(campaign.cpa)}</td>

        <td className="px-3 py-3 text-right">
          <TrendBadge change={campaign.trend} improving={campaign.trend > 0} size="md" />
        </td>
      </tr>

      {expanded && (
        loadingDetail && !adSets ? (
          <tr>
            <td colSpan={6} className="py-3 pl-12 text-xs t3">
              <Loader2 size={12} className="inline animate-spin mr-1.5" />
              Loading ad sets…
            </td>
          </tr>
        ) : detailError ? (
          <tr>
            <td colSpan={6} className="py-3 pl-12 text-xs text-red-500">
              Failed to load: {detailError}
            </td>
          </tr>
        ) : displayAdSets.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-3 pl-12 text-xs t3">No ad sets found for this campaign.</td>
          </tr>
        ) : (
          displayAdSets.map((adSet: any) => <AdSetRow key={adSet.id} adSet={adSet} />)
        )
      )}
    </>
  )
}
