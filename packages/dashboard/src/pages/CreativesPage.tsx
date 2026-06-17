import { useState } from 'react'
import clsx from 'clsx'
import { Loader2, AlertTriangle, Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CreativeCard } from '@/components/creatives/CreativeCard'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useMetaCreatives } from '@/hooks/useMetaData'
import { getCreatives } from '@/lib/mock-data'
import { transformInsightMetrics, safeFloat } from '@/lib/meta-transform'

type SortKey = 'roas' | 'spend' | 'ctr' | 'trend'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'roas',  label: 'ROAS' },
  { value: 'spend', label: 'Spend' },
  { value: 'ctr',   label: 'CTR' },
  { value: 'trend', label: 'Trend' },
]

// Raw Meta ad (from getTopAds) → Creative shape expected by CreativeCard.
// Note: insights are nested as `ad.insights.data[0]`, not flat.
function transformRawAd(ad: any) {
  const ins = ad.insights?.data?.[0] ?? null
  const metrics = transformInsightMetrics(ins)
  const creative = ad.creative ?? {}
  const format = creative.video_id
    ? 'video'
    : creative.object_type === 'SHARE'
    ? 'carousel'
    : 'image'
  const thumbnailUrl = creative.thumbnail_url ?? creative.image_url ?? ''
  const isTopPerformer = metrics.roas >= 3.5
  const fatigueRisk    = metrics.frequency >= 3
  return {
    id: ad.id ?? String(Math.random()),
    name: ad.name ?? 'Unnamed ad',
    format,
    thumbnailUrl,
    spend:           metrics.spend,
    roas:            metrics.roas,
    ctr:             metrics.ctr,
    cpa:             metrics.cpa,
    frequency:       metrics.frequency,
    trend:           0,
    isTopPerformer,
    fatigueRisk,
  }
}

function ConnectedView() {
  const { clientId } = useFilterStore()
  const [sortBy, setSortBy] = useState<SortKey>('roas')
  const [filterFatigue, setFilterFatigue] = useState(false)
  const [filterTop, setFilterTop] = useState(false)

  const { data: rawAds, loading, error } = useMetaCreatives()

  const creatives = rawAds
    .map(transformRawAd)
    .filter((c) => (!filterFatigue || c.fatigueRisk) && (!filterTop || c.isTopPerformer))
    .sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold t1">Creatives</h1>
          <p className="text-sm t3 mt-0.5">Live Meta ads · 30-day window · Click thumbnail to preview</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">Live</span>
          {loading && <Loader2 size={13} className="animate-spin t3" />}
          <button
            onClick={() => setFilterTop(!filterTop)}
            className={clsx('px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors', filterTop ? 'bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 border-indigo-500/40' : 't2 border-theme hover:border-surface-3')}
          >
            ★ Top performers
          </button>
          <button
            onClick={() => setFilterFatigue(!filterFatigue)}
            className={clsx('px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors', filterFatigue ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/40' : 't2 border-theme hover:border-surface-3')}
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
                className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors', sortBy === o.value ? 'bg-surface-3 t1 shadow-sm' : 't3 hover:t2')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          <AlertTriangle size={15} /> Failed to load creatives: {error}
        </div>
      )}

      {loading && rawAds.length === 0 ? (
        <div className="flex items-center gap-2 text-sm t3 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading live creative data from Meta…
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6 text-xs t3">
            <span>{creatives.length} creatives</span>
            <span>{creatives.filter((c) => c.isTopPerformer).length} top performers</span>
            <span className="text-amber-500 dark:text-amber-400">{creatives.filter((c) => c.fatigueRisk).length} at fatigue risk</span>
          </div>
          {creatives.length === 0 ? (
            <div className="flex items-center justify-center h-48 t3 text-sm">
              No creatives match the current filters
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {creatives.map((c) => <CreativeCard key={c.id} creative={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MockView() {
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
          <Link to="/settings" className="flex items-center gap-2 text-xs font-semibold bg-[#1877F2] hover:bg-[#166fe5] text-white px-3 py-1.5 rounded-lg transition-colors">
            <Link2 size={12} /> Connect Meta Ads
          </Link>
          <button
            onClick={() => setFilterTop(!filterTop)}
            className={clsx('px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors', filterTop ? 'bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 border-indigo-500/40' : 't2 border-theme hover:border-surface-3')}
          >
            ★ Top performers
          </button>
          <button
            onClick={() => setFilterFatigue(!filterFatigue)}
            className={clsx('px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors', filterFatigue ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/40' : 't2 border-theme hover:border-surface-3')}
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
                className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors', sortBy === o.value ? 'bg-surface-3 t1 shadow-sm' : 't3 hover:t2')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle size={13} className="shrink-0" />
        Showing demo data. <Link to="/settings" className="underline font-medium">Connect your Meta account</Link> to see live creatives.
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

export function CreativesPage() {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const connected = clients.find((c) => c.id === clientId)?.meta.connected ?? false
  return connected ? <ConnectedView /> : <MockView />
}
