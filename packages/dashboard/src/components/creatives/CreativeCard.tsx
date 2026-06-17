import { useState } from 'react'
import { TrendingUp, TrendingDown, AlertTriangle, Star, ExternalLink, Image, Film, LayoutGrid } from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency, formatRoas, formatPercent } from '@/lib/formatters'
import { FormatBadge } from '@/components/ui/Badge'

interface Creative {
  id: string; name: string; format: string; thumbnailUrl: string; previewUrl?: string
  spend: number; roas: number; ctr: number; cpa: number
  frequency: number; trend: number; isTopPerformer: boolean; fatigueRisk: boolean
}

function ThumbnailPlaceholder({ format }: { format: string }) {
  const Icon = format === 'video' ? Film : format === 'carousel' ? LayoutGrid : Image
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-surface-2">
      <Icon size={28} className="t3 opacity-40" />
      <span className="text-[10px] t3 opacity-50">No preview</span>
    </div>
  )
}

export function CreativeCard({ creative }: { creative: Creative }) {
  const [imgFailed, setImgFailed] = useState(false)
  const trendPositive = creative.trend > 0
  const hasPreview = !!creative.previewUrl

  return (
    <div className={clsx(
      'group relative flex flex-col bg-surface border rounded-xl overflow-hidden transition-all hover:border-surface-3',
      creative.isTopPerformer
        ? 'border-indigo-500/50'
        : creative.fatigueRisk
          ? 'border-amber-500/40'
          : 'border-theme'
    )}>
      {/* Thumbnail */}
      <div className="relative aspect-[3/4] bg-surface-2 overflow-hidden">
        {!imgFailed && creative.thumbnailUrl ? (
          <img
            src={creative.thumbnailUrl}
            alt={creative.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ThumbnailPlaceholder format={creative.format} />
        )}

        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {creative.isTopPerformer && (
            <span className="flex items-center gap-1 bg-indigo-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
              <Star size={9} fill="currentColor" /> Top
            </span>
          )}
          {creative.fatigueRisk && (
            <span className="flex items-center gap-1 bg-amber-500/90 backdrop-blur-sm text-black text-[10px] font-bold px-1.5 py-0.5 rounded-md">
              <AlertTriangle size={9} /> Fatigue
            </span>
          )}
        </div>

        <div className="absolute top-2 right-2">
          <FormatBadge format={creative.format} />
        </div>

        {/* Hover overlay — Preview Ad CTA */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          {hasPreview ? (
            <a
              href={creative.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-xs text-white font-medium bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1.5 rounded-lg transition-colors w-full justify-center"
            >
              <ExternalLink size={11} /> Preview Ad on Facebook
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-white/50 font-medium bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-lg w-full justify-center cursor-default">
              <ExternalLink size={11} /> No preview URL
            </span>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="p-3 space-y-2">
        <p className="text-xs font-semibold t1 truncate" title={creative.name}>{creative.name}</p>

        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div>
            <p className="t3">Spend</p>
            <p className="font-semibold t1">{formatCurrency(creative.spend)}</p>
          </div>
          <div>
            <p className="t3">ROAS</p>
            <p className={clsx('font-bold', creative.roas >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : creative.roas >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
              {formatRoas(creative.roas)}
            </p>
          </div>
          <div>
            <p className="t3">CTR</p>
            <p className="font-semibold t1">{formatPercent(creative.ctr)}</p>
          </div>
          <div>
            <p className="t3">CPA</p>
            <p className="font-semibold t1">{formatCurrency(creative.cpa)}</p>
          </div>
        </div>

        <div className={clsx(
          'flex items-center gap-1 text-[11px] font-medium pt-1 border-t border-theme',
          trendPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        )}>
          {trendPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {creative.trend > 0 ? '+' : ''}{creative.trend.toFixed(1)}% vs prev
          {creative.fatigueRisk && (
            <span className="ml-auto text-amber-500 dark:text-amber-400 text-[10px]">Freq {creative.frequency.toFixed(1)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
