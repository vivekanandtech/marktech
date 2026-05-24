import { useState } from 'react'
import clsx from 'clsx'
import { CreativeCard } from '@/components/creatives/CreativeCard'
import { useFilterStore } from '@/store/filterStore'
import { getCreatives } from '@/lib/mock-data'

type SortKey = 'roas' | 'spend' | 'ctr' | 'trend'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'roas', label: 'ROAS' },
  { value: 'spend', label: 'Spend' },
  { value: 'ctr', label: 'CTR' },
  { value: 'trend', label: 'Trend' },
]

export function CreativesPage() {
  const { clientId } = useFilterStore()
  const [sortBy, setSortBy] = useState<SortKey>('roas')
  const [filterFatigue, setFilterFatigue] = useState(false)
  const [filterTop, setFilterTop] = useState(false)

  const creatives = getCreatives(clientId)
    .filter((c) => (!filterFatigue || c.fatigueRisk) && (!filterTop || c.isTopPerformer))
    .sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold t1">Creatives</h1>
          <p className="text-sm t3 mt-0.5">All ad formats · Click thumbnail to preview</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterTop(!filterTop)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              filterTop ? 'bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 border-indigo-500/40' : 't2 border-theme hover:border-surface-3'
            )}
          >
            ★ Top performers
          </button>
          <button
            onClick={() => setFilterFatigue(!filterFatigue)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              filterFatigue ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/40' : 't2 border-theme hover:border-surface-3'
            )}
          >
            ⚠ Fatigue risk
          </button>

          <div className="w-px h-5 bg-surface-3" />

          <div className="flex items-center gap-1 bg-surface-2 border border-theme rounded-lg p-0.5">
            <span className="px-2 text-[10px] t3 font-medium">Sort by</span>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setSortBy(o.value)}
                className={clsx(
                  'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                  sortBy === o.value ? 'bg-surface-3 t1 shadow-sm' : 't3 hover:t2'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 text-xs t3">
        <span>{creatives.length} creatives</span>
        <span>{creatives.filter((c) => c.isTopPerformer).length} top performers</span>
        <span className="text-amber-500 dark:text-amber-400">{creatives.filter((c) => c.fatigueRisk).length} at fatigue risk</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {creatives.map((c) => <CreativeCard key={c.id} creative={c} />)}
      </div>
    </div>
  )
}
