import { Video, Image, LayoutGrid, Play } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency, formatRoas, formatPercent } from '@/lib/formatters'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { ActionTagBadge, FormatBadge, StatusBadge } from '@/components/ui/Badge'

interface Ad {
  id: string; name: string; format: string; status: string; thumbnailUrl: string
  spend: number; roas: number; ctr: number; cpa: number; cpc: number
  impressions: number; clicks: number; conversions: number; frequency: number
  actionTag: string; trend: number
}

const FORMAT_ICONS: Record<string, React.ReactNode> = {
  video:    <Video size={10} />,
  reel:     <Play size={10} />,
  carousel: <LayoutGrid size={10} />,
  image:    <Image size={10} />,
}

export function AdRow({ ad }: { ad: Ad }) {
  return (
    <tr className="hover:bg-surface-2/30 transition-colors">
      {/* Ad level — deeper indent, double-level left border */}
      <td className="py-2 pr-3">
        <div className="flex items-center ml-8 pl-4 border-l-2 border-violet-500/20">
          <div className="relative w-7 h-9 rounded overflow-hidden shrink-0 bg-surface-3 mr-2.5 flex items-center justify-center">
            {ad.thumbnailUrl ? (
              <>
                <img src={ad.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 flex items-end justify-start p-0.5">
                  <span className="bg-black/70 rounded-sm p-0.5 text-white">
                    {FORMAT_ICONS[ad.format] ?? <Image size={9} />}
                  </span>
                </div>
              </>
            ) : (
              <span className="t3">{FORMAT_ICONS[ad.format] ?? <Image size={9} />}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[11px] font-medium t2">{ad.name}</p>
              <ActionTagBadge tag={ad.actionTag} />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <FormatBadge format={ad.format} />
              <StatusBadge status={ad.status} />
              {ad.frequency > 3 && (
                <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">⚠ Freq {ad.frequency.toFixed(1)}</span>
              )}
            </div>
          </div>
        </div>
      </td>

      <td className="px-3 py-2 text-right text-[11px]">
        <p className="font-medium t3">{formatCurrency(ad.spend)}</p>
      </td>

      <td className="px-3 py-2 text-right text-[11px]">
        <p className={clsx('font-bold', ad.roas >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : ad.roas >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
          {formatRoas(ad.roas)}
        </p>
      </td>

      <td className="px-3 py-2 text-right text-[11px] t3">{formatPercent(ad.ctr)}</td>
      <td className="px-3 py-2 text-right text-[11px] t3">{formatCurrency(ad.cpa)}</td>

      <td className="px-3 py-2 text-right">
        <TrendBadge change={ad.trend} improving={ad.trend > 0} />
      </td>
    </tr>
  )
}
