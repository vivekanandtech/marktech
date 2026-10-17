import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Loader2, AlertTriangle, Link2, Lightbulb, Video, LayoutGrid, Image as ImageIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CreativeCard } from '@/components/creatives/CreativeCard'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useMetaCreatives } from '@/hooks/useMetaData'
import { getCreatives } from '@/lib/mock-data'
import { transformInsightMetrics, safeFloat, classifyCreativeFormat, CreativeFormat } from '@/lib/meta-transform'
import { maxActionCount, maxActionValue, PURCHASE_ACTION_TYPES } from '@/lib/meta-actions'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { useActionablesStore, actionableTitle } from '@/store/actionablesStore'

type SortKey = 'roas' | 'spend' | 'ctr' | 'trend'
type FormatFilter = 'all' | CreativeFormat

const FORMAT_FILTERS: { value: FormatFilter; label: string }[] = [
  { value: 'all',      label: 'All formats' },
  { value: 'video',    label: 'Video' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'image',    label: 'Image' },
]

const FORMAT_ROLLUP_ORDER: CreativeFormat[] = ['video', 'carousel', 'image']
const FORMAT_ROLLUP_ICON: Record<CreativeFormat, React.ElementType> = {
  video: Video, carousel: LayoutGrid, image: ImageIcon,
}
const FORMAT_ROLLUP_LABEL: Record<CreativeFormat, string> = {
  video: 'Video', carousel: 'Carousel', image: 'Image',
}

interface FormatRollupRow {
  format: CreativeFormat
  count: number
  spend: number
  roas: number
  ctr: number
  conversions: number
}

// Aggregates must be recomputed from summed totals, not averaged per-ad —
// averaging individual ROAS/CTR values would overweight low-spend ads.
function computeFormatRollup(rawAds: any[]): FormatRollupRow[] {
  const totals: Record<CreativeFormat, { spend: number; conversionValue: number; clicks: number; impressions: number; conversions: number; count: number }> = {
    video:    { spend: 0, conversionValue: 0, clicks: 0, impressions: 0, conversions: 0, count: 0 },
    carousel: { spend: 0, conversionValue: 0, clicks: 0, impressions: 0, conversions: 0, count: 0 },
    image:    { spend: 0, conversionValue: 0, clicks: 0, impressions: 0, conversions: 0, count: 0 },
  }
  for (const ad of rawAds) {
    const ins = ad.insights?.data?.[0] ?? null
    const format = classifyCreativeFormat(ad.creative)
    const t = totals[format]
    t.spend += safeFloat(ins?.spend)
    t.conversionValue += maxActionValue(ins, PURCHASE_ACTION_TYPES)
    t.clicks += safeFloat(ins?.clicks)
    t.impressions += safeFloat(ins?.impressions)
    t.conversions += maxActionCount(ins, PURCHASE_ACTION_TYPES)
    t.count += 1
  }
  return FORMAT_ROLLUP_ORDER.map((format) => {
    const t = totals[format]
    return {
      format,
      count: t.count,
      spend: t.spend,
      roas: t.spend > 0 ? t.conversionValue / t.spend : 0,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
      conversions: t.conversions,
    }
  })
}

function FormatRollup({ rawAds }: { rawAds: any[] }) {
  const rollup = useMemo(() => computeFormatRollup(rawAds), [rawAds])
  const totalSpend = rollup.reduce((s, r) => s + r.spend, 0)

  if (rawAds.length === 0) return null

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold t1 mb-3">Performance by Creative Type</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rollup.map((r) => {
          const Icon = FORMAT_ROLLUP_ICON[r.format]
          const share = totalSpend > 0 ? (r.spend / totalSpend) * 100 : 0
          return (
            <div key={r.format} className="rounded-xl border border-theme p-3 bg-surface-2">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold t1">
                  <Icon size={13} /> {FORMAT_ROLLUP_LABEL[r.format]}
                </span>
                <span className="text-[10px] t3">{r.count} ad{r.count !== 1 ? 's' : ''} · {share.toFixed(0)}% of spend</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold t1">{r.spend > 0 ? formatCurrency(r.spend) : '—'}</p>
                  <p className="text-[10px] t3">Spend</p>
                </div>
                <div>
                  <p className={clsx('text-sm font-bold', r.roas <= 0 ? 't3' : r.roas >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : r.roas >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                    {r.spend > 0 ? formatRoas(r.roas) : '—'}
                  </p>
                  <p className="text-[10px] t3">ROAS</p>
                </div>
                <div>
                  <p className="text-sm font-bold t1">{r.spend > 0 ? formatPercent(r.ctr) : '—'}</p>
                  <p className="text-[10px] t3">CTR</p>
                </div>
              </div>
              <p className="text-[10px] t3 mt-1.5 text-center">{formatNumber(r.conversions)} conversions</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
  const format = classifyCreativeFormat(creative)
  // _imageUrl and _previewUrl are pre-resolved by the API's pickBestImage/buildPreviewUrl helpers
  const thumbnailUrl = creative._imageUrl ?? creative.image_url ?? creative.thumbnail_url ?? ''
  const previewUrl   = creative._previewUrl ?? ''
  const isTopPerformer = metrics.roas >= 3.5
  const fatigueRisk    = metrics.frequency >= 3
  return {
    id: ad.id ?? String(Math.random()),
    name: ad.name ?? 'Unnamed ad',
    format,
    thumbnailUrl,
    previewUrl,
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
  const { clients } = useClientStore()
  const adAccountId = clients.find((c) => c.id === clientId)?.metaAdAccountId ?? null
  const [sortBy, setSortBy] = useState<SortKey>('roas')
  const [filterFatigue, setFilterFatigue] = useState(false)
  const [filterTop, setFilterTop] = useState(false)
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all')

  const { data: rawAds, loading, error } = useMetaCreatives()
  const actionablesPayload = useActionablesStore((s) => s.payload)
  const creativeActions = (actionablesPayload?.items ?? []).filter((i) => i.category === 'creative' && i.status === 'new').slice(0, 5)

  const allCreatives = rawAds.map(transformRawAd)
  const creatives = allCreatives
    .filter((c) => (!filterFatigue || c.fatigueRisk) && (!filterTop || c.isTopPerformer) && (formatFilter === 'all' || c.format === formatFilter))
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
            {FORMAT_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormatFilter(f.value)}
                className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors', formatFilter === f.value ? 'bg-indigo-600 text-white shadow-sm' : 't2 hover:t1')}
              >
                {f.label}
              </button>
            ))}
          </div>
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

      {!loading && rawAds.length > 0 && <FormatRollup rawAds={rawAds} />}

      {creativeActions.length > 0 && (
        <div className="space-y-2">
          {creativeActions.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
              <Lightbulb size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold t1">{actionableTitle(a)}</p>
                <p className="text-xs t2 mt-0.5">{a.detail}</p>
              </div>
            </div>
          ))}
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
              {creatives.map((c) => <CreativeCard key={c.id} creative={c} adAccountId={adAccountId} />)}
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
