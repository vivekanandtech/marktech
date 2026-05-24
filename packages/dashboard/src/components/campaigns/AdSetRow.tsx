import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency, formatRoas, formatPercent } from '@/lib/formatters'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { ActionTagBadge, StatusBadge } from '@/components/ui/Badge'
import { AdRow } from './AdRow'

interface AdSet {
  id: string; name: string; audience: string; status: string
  spend: number; roas: number; ctr: number; cpa: number; cpc: number
  impressions: number; clicks: number; conversions: number; frequency: number
  actionTag: string; trend: number; ads: any[]
}

export function AdSetRow({ adSet }: { adSet: AdSet }) {
  const [expanded, setExpanded] = useState(false)

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
                <p className="text-xs font-semibold t1">{adSet.name}</p>
                <ActionTagBadge tag={adSet.actionTag} />
              </div>
              <p className="text-[10px] t3 mt-0.5 truncate max-w-[300px]">{adSet.audience}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <StatusBadge status={adSet.status} />
                <span className="text-[10px] t3">{adSet.ads.length} ads</span>
              </div>
            </div>
          </div>
        </td>

        <td className="px-3 py-2.5 text-right text-xs">
          <p className="font-medium t2">{formatCurrency(adSet.spend)}</p>
        </td>

        <td className="px-3 py-2.5 text-right text-xs">
          <p className={clsx('font-bold', adSet.roas >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : adSet.roas >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
            {formatRoas(adSet.roas)}
          </p>
        </td>

        <td className="px-3 py-2.5 text-right text-xs t3">{formatPercent(adSet.ctr)}</td>
        <td className="px-3 py-2.5 text-right text-xs t3">{formatCurrency(adSet.cpa)}</td>
        <td className="px-3 py-2.5 text-right"><TrendBadge change={adSet.trend} improving={adSet.trend > 0} /></td>
      </tr>

      {expanded && adSet.ads.map((ad) => <AdRow key={ad.id} ad={ad} />)}
    </>
  )
}
