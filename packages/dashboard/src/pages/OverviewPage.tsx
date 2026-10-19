import { useState } from 'react'
import {
  IndianRupee, TrendingUp, Eye, MousePointer, Layers, Globe, BarChart2,
  ChevronRight, ArrowRight, Loader2, AlertTriangle, PlugZap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { MetricCard } from '@/components/ui/MetricCard'
import { MetricInfoTooltip } from '@/components/ui/MetricInfoTooltip'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { RoasChart } from '@/components/charts/RoasChart'
import { SpendVsSalesChart } from '@/components/charts/SpendVsSalesChart'
import { ConversionRateChart } from '@/components/charts/ConversionRateChart'
import { ProductFunnelChart, ProductFunnelStage } from '@/components/charts/ProductFunnelChart'
import { FormatBreakdownChart } from '@/components/charts/FormatBreakdownChart'
import { CreativeCard } from '@/components/creatives/CreativeCard'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { ReconciliationSection } from '@/components/reconciliation/ReconciliationSection'
import { ActionablesTeaser } from '@/components/actionables/ActionablesTeaser'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useMetaCampaigns, useMetaDailyInsights, useMetaCreatives } from '@/hooks/useMetaData'
import { useGoogleCampaigns, useGoogleDailyInsights } from '@/hooks/useGoogleData'
import { useOverviewMetrics } from '@/hooks/useOverviewMetrics'
import { useProductPerformance } from '@/hooks/useProductPerformance'
import { getMetricStatus } from '@/lib/metric-thresholds'
import { getSummaryMetrics, getChartData, getFormatBreakdown, getCreatives } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { transformInsightMetrics, transformMetaCampaign, safeFloat, safeInt, classifyCreativeFormat } from '@/lib/meta-transform'
import { transformGoogleCampaign, microsToCurrency } from '@/lib/google-transform'
import { maxActionCount, maxActionValue, PURCHASE_ACTION_TYPES } from '@/lib/meta-actions'
import type { PeriodMetrics, PlatformStatus } from '@/store/metricsDataStore'

// ─── Daily chart rows (one shape for Meta, Google and Blended) ───────────────
interface DayRow { iso: string; spend: number; value: number; purchases: number; clicks: number }

function metaDay(row: any): DayRow {
  return {
    iso: String(row.date_start),
    spend: safeFloat(row.spend),
    value: maxActionValue(row, PURCHASE_ACTION_TYPES),
    purchases: maxActionCount(row, PURCHASE_ACTION_TYPES),
    clicks: safeInt(row.clicks),
  }
}

function googleDay(row: any): DayRow {
  const m = row.metrics ?? {}
  return {
    iso: String(row.segments?.date ?? ''),
    spend: microsToCurrency(m.costMicros),
    value: Number(m.conversionsValue) || 0,
    purchases: Number(m.conversions) || 0,
    clicks: Number(m.clicks) || 0,
  }
}

function toChartRows(days: DayRow[]) {
  return [...days].sort((a, b) => a.iso.localeCompare(b.iso)).map((d) => ({
    date: new Date(d.iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    metaSpend: Math.round(d.spend),
    purchaseValue: Math.round(d.value),
    roas: d.spend > 0 ? parseFloat((d.value / d.spend).toFixed(2)) : 0,
    conversionRate: d.clicks > 0 ? parseFloat(((d.purchases / d.clicks) * 100).toFixed(2)) : 0,
  }))
}

function mergeDays(a: DayRow[], b: DayRow[]): DayRow[] {
  const byDate = new Map<string, DayRow>()
  for (const d of [...a, ...b]) {
    const cur = byDate.get(d.iso)
    byDate.set(d.iso, cur
      ? { iso: d.iso, spend: cur.spend + d.spend, value: cur.value + d.value, purchases: cur.purchases + d.purchases, clicks: cur.clicks + d.clicks }
      : { ...d })
  }
  return [...byDate.values()]
}

// ─── Top creative card shape ──────────────────────────────────────────────────
function toCreativeShape(ad: any, idx: number) {
  const ins = ad.insights?.data?.[0] ?? null
  const metrics = transformInsightMetrics(ins)
  const creative = ad.creative ?? {}
  return {
    id: ad.id ?? String(idx),
    name: ad.name ?? 'Unnamed ad',
    format: classifyCreativeFormat(creative),
    thumbnailUrl: creative.thumbnail_url ?? creative.image_url ?? '',
    spend: metrics.spend, roas: metrics.roas, ctr: metrics.ctr, cpa: metrics.cpa, frequency: metrics.frequency,
    trend: 0,
    isTopPerformer: metrics.roas >= 3.5,
    fatigueRisk: metrics.frequency >= 3,
  }
}

// Real spend/ROAS split by creative format, from the top-spending ads.
function formatBreakdown(rawAds: any[]) {
  const acc = new Map<string, { spend: number; value: number; impressions: number }>()
  for (const ad of rawAds) {
    const m = transformInsightMetrics(ad.insights?.data?.[0] ?? null)
    const label = { video: 'Video', carousel: 'Carousel', image: 'Image' }[classifyCreativeFormat(ad.creative)] ?? 'Image'
    const cur = acc.get(label) ?? { spend: 0, value: 0, impressions: 0 }
    acc.set(label, { spend: cur.spend + m.spend, value: cur.value + m.roas * m.spend, impressions: cur.impressions + m.impressions })
  }
  return [...acc.entries()]
    .map(([format, v]) => ({ format, spend: Math.round(v.spend), roas: v.spend > 0 ? v.value / v.spend : 0, impressions: v.impressions }))
    .sort((a, b) => b.spend - a.spend)
}

type ActionTagFilter = 'all' | 'scale' | 'watch' | 'optimise'
const ACTION_TAG_FILTERS: { value: ActionTagFilter; label: string; activeClass: string }[] = [
  { value: 'all',      label: 'All',        activeClass: 'bg-slate-600 text-white' },
  { value: 'scale',    label: '↑ Scale',    activeClass: 'bg-emerald-500 text-white' },
  { value: 'watch',    label: '◎ Watch',    activeClass: 'bg-amber-500 text-white' },
  { value: 'optimise', label: '⚙ Optimise', activeClass: 'bg-blue-500 text-white' },
]
const TAG_ORDER: Record<string, number> = { scale: 0, watch: 1, optimise: 2 }

type Channel = 'meta' | 'google' | 'blended'
const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
  { value: 'blended', label: 'Blended' },
]
const CHANNEL_NAME: Record<Channel, string> = { meta: 'Meta', google: 'Google', blended: 'Meta + Google' }

// Which PeriodMetrics field backs each card, per channel.
const FIELDS: Record<Channel, { roas: keyof PeriodMetrics; spend: keyof PeriodMetrics; sessions: keyof PeriodMetrics; cpr: keyof PeriodMetrics; ctr: keyof PeriodMetrics; cpm: keyof PeriodMetrics }> = {
  meta:    { roas: 'metaRoas', spend: 'metaSpend', sessions: 'metaSessions', cpr: 'attributedCPR', ctr: 'metaCtr', cpm: 'metaCpm' },
  google:  { roas: 'googleRoas', spend: 'googleSpend', sessions: 'googleSessions', cpr: 'googleAttributedCPR', ctr: 'googleCtr', cpm: 'googleCpm' },
  blended: { roas: 'blendedPlatformRoas', spend: 'blendedSpend', sessions: 'blendedSessions', cpr: 'blendedAttributedCPR', ctr: 'blendedCtr', cpm: 'blendedCpm' },
}
const ROAS_METRIC_ID: Record<Channel, string> = { meta: 'metaRoas', google: 'googleRoas', blended: 'blendedPlatformRoas' }
const ROAS_SUBTITLE: Record<Channel, string> = {
  meta: 'Facebook & Instagram · as reported by Meta',
  google: 'Google Ads · as reported by Google',
  blended: 'Meta + Google · as reported by the platforms',
}

function ChartCard({ title, subtitle, badge, right, children }: { title: string; subtitle: string; badge?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-0.5 gap-2">
        <h3 className="text-sm font-semibold t1">{title}</h3>
        <div className="flex items-center gap-1.5">{badge}{right}</div>
      </div>
      <p className="text-xs t3 mb-4">{subtitle}</p>
      {children}
    </div>
  )
}

const DemoBadge = () => <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo</span>

function ChartPlaceholder({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-[220px] t3 text-sm text-center px-6">{text}</div>
}

export function OverviewPage() {
  const { clientId, dateRange, country } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const metaConnected = currentClient?.meta.connected ?? false
  const metaAdAccountId = currentClient?.metaAdAccountId ?? null
  const thresholds = currentClient?.settings.thresholds
  const [channel, setChannel] = useState<Channel>('meta')
  const [tagFilter, setTagFilter] = useState<ActionTagFilter>('all')
  const [cvrSmoothing, setCvrSmoothing] = useState<'daily' | '7day'>('daily')
  const [funnelViewMode, setFunnelViewMode] = useState<'count' | 'percent'>('count')

  const { data: rawCampaigns, accountInsights, loading: campaignsLoading } = useMetaCampaigns()
  const { data: metaDailyRows, loading: metaChartsLoading } = useMetaDailyInsights()
  const { data: rawAds, loading: creativesLoading } = useMetaCreatives()
  const { data: rawGoogleCampaigns, loading: googleCampaignsLoading } = useGoogleCampaigns()
  const { data: googleDailyRows } = useGoogleDailyInsights()
  const { data: ov, connectedSomewhere } = useOverviewMetrics()
  const { data: productData } = useProductPerformance()

  // Demo mode only when nothing at all is connected for this client.
  const demo = !connectedSomewhere
  const mockMarket = country === 'all' ? 'all' : country === 'India' ? 'india' : 'international'
  const mock = getSummaryMetrics(clientId, mockMarket)

  // ── Channel status ────────────────────────────────────────────────────────
  const googleStatus: PlatformStatus = ov?.platformStatus?.google
    ?? (currentClient?.google?.connected ? 'live' : 'not_connected')
  const googleDown = googleStatus !== 'live'
  const channelNA = channel === 'google' && googleDown
  const naText = googleStatus === 'sync_error' ? 'Google Ads not synced' : 'Google Ads not connected'
  const blendedExcludesGoogle = channel === 'blended' && googleStatus === 'sync_error'
  // Name of what the channel-specific cards actually include right now.
  const chName = blendedExcludesGoogle ? 'Meta' : CHANNEL_NAME[channel]
  const metaError = ov?.platformErrors?.meta && channel !== 'google' ? ov.platformErrors.meta : null
  const shopify = !!ov?.connected.shopify

  const f = FIELDS[channel]
  const cur = (k: keyof PeriodMetrics) => (ov ? Number(ov.current[k]) || 0 : 0)
  const delta = (k: keyof PeriodMetrics) => (ov ? ov.deltas[k as string] ?? 0 : 0)

  // Live account totals straight from Meta are available before the
  // (slower) cross-channel metrics finish — use them meanwhile for Meta.
  const acct = accountInsights ? transformInsightMetrics(accountInsights) : null
  const pick = (k: keyof PeriodMetrics, fallback: number) => (ov ? cur(k) : channel === 'meta' && acct ? fallback : 0)

  const heroRoas = demo ? mock.blendedRoas.value : pick(f.roas, acct?.roas ?? 0)
  const spend = demo ? mock.adSpend.value : pick(f.spend, acct?.spend ?? 0)
  const ctr = demo ? mock.ctr.value : pick(f.ctr, acct?.ctr ?? 0)
  const cpm = demo ? mock.cpm.value : pick(f.cpm, acct?.cpm ?? 0)
  const sessions = cur(f.sessions)
  const cpr = cur(f.cpr)
  const attributedOrders = channel === 'meta' ? cur('metaAttributedOrders') : channel === 'google' ? cur('googleAttributedOrders') : cur('metaAttributedOrders') + cur('googleAttributedOrders')
  const totalOrders = cur('totalOrders')

  const naCard = (label: string, icon?: React.ReactNode) => (
    <MetricCard label={label} value="NA" subtitle={naText} change={null} improving icon={icon} />
  )

  // ── Charts per channel ───────────────────────────────────────────────────
  const metaDays = metaDailyRows.map(metaDay)
  const googleDays = googleStatus === 'live' ? googleDailyRows.map(googleDay) : []
  const channelDays = channel === 'meta' ? metaDays : channel === 'google' ? googleDays : mergeDays(metaDays, googleDays)
  const liveChart = toChartRows(channelDays)
  const mockChart = getChartData(clientId, dateRange, mockMarket).map((d: any) => ({ ...d, purchaseValue: d.netSales ?? 0, roas: d.roas ?? d.blendedRoas ?? 0 }))
  const chartData = demo ? mockChart : liveChart
  const cvrChartData = cvrSmoothing === 'daily'
    ? chartData
    : chartData.map((d: any, i: number) => {
        const w = chartData.slice(Math.max(0, i - 6), i + 1)
        return { ...d, conversionRate: parseFloat((w.reduce((s: number, x: any) => s + (x.conversionRate ?? 0), 0) / w.length).toFixed(2)) }
      })
  const chartEmptyText = channelNA ? `${naText} — no data to chart` : metaChartsLoading ? 'Loading…' : 'No delivery in this window'
  const chartLabel = channel === 'google' ? 'Google' : channel === 'blended' ? 'Blended' : 'Meta'

  // ── Funnel (Shopify storefront) ──────────────────────────────────────────
  const funnelTotals = (productData?.products ?? []).reduce((acc, p) => ({
    sessions: acc.sessions + p.sessions,
    addToCart: acc.addToCart + p.addToCart,
    checkoutsInitiated: acc.checkoutsInitiated + p.checkoutsInitiated,
    orders: acc.orders + p.shopifyOrders,
  }), { sessions: 0, addToCart: 0, checkoutsInitiated: 0, orders: 0 })
  const pctOf = (v: number) => (funnelTotals.sessions > 0 ? (v / funnelTotals.sessions) * 100 : 0)
  const funnelStages: ProductFunnelStage[] = funnelViewMode === 'count'
    ? [
        { stage: 'Sessions', value: funnelTotals.sessions },
        { stage: 'Add to Cart', value: funnelTotals.addToCart },
        { stage: 'Checkout', value: funnelTotals.checkoutsInitiated },
        { stage: 'Purchase', value: funnelTotals.orders },
      ]
    : [
        { stage: 'Sessions', value: funnelTotals.sessions > 0 ? 100 : 0 },
        { stage: 'Add to Cart', value: pctOf(funnelTotals.addToCart) },
        { stage: 'Checkout', value: pctOf(funnelTotals.checkoutsInitiated) },
        { stage: 'Purchase', value: pctOf(funnelTotals.orders) },
      ]

  // ── Creative format (real when Meta is connected) ────────────────────────
  const formatData = metaConnected && rawAds.length > 0 ? formatBreakdown(rawAds) : demo ? getFormatBreakdown(clientId) : []

  // ── Top campaigns ─────────────────────────────────────────────────────────
  const metaCampaigns = rawCampaigns.map(transformMetaCampaign).filter((c): c is NonNullable<ReturnType<typeof transformMetaCampaign>> => c !== null)
  const googleCampaigns = googleDown ? [] : rawGoogleCampaigns.map(transformGoogleCampaign)
  const campaignsForChannel = channel === 'meta' ? metaCampaigns : channel === 'google' ? googleCampaigns : [...metaCampaigns, ...googleCampaigns]
  const topCampaigns = campaignsForChannel
    .filter((c) => tagFilter === 'all' || c.actionTag === tagFilter)
    .sort((a, b) => (TAG_ORDER[a.actionTag ?? ''] ?? 3) - (TAG_ORDER[b.actionTag ?? ''] ?? 3) || b.roas - a.roas)
    .slice(0, 5)
  const campaignsLoadingAny = campaignsLoading || googleCampaignsLoading

  // ── Top creatives ─────────────────────────────────────────────────────────
  const liveCreatives = rawAds.slice(0, 4).map(toCreativeShape)
  const topCreatives = metaConnected && liveCreatives.length > 0 ? liveCreatives : demo ? getCreatives(clientId).slice(0, 4) : []

  // ── Channel & country split ──────────────────────────────────────────────
  const metaSpendTotal = ov ? cur('metaSpend') : acct?.spend ?? 0
  const googleSpendTotal = ov && !googleDown ? cur('googleSpend') : 0
  const countryBreakdown = ov?.countryBreakdown ?? []
  const totalCountrySales = countryBreakdown.reduce((s, c) => s + c.netSales, 0)
  const conversionRate = cur('conversionRate')

  // Every source is always named, with its state — Google included even when
  // it isn't live, since the page has a Google view.
  const liveSources = [metaConnected && 'Meta', googleStatus === 'live' && 'Google', shopify && 'Shopify'].filter(Boolean).join(' + ')
  const offlineSources = [
    !metaConnected && 'Meta not connected',
    googleStatus === 'sync_error' && 'Google not synced',
    googleStatus === 'not_connected' && 'Google not connected',
    ov && !shopify && 'Shopify not connected',
  ].filter(Boolean).join(' · ')
  const sourcesLabel = [liveSources && `Live · ${liveSources}`, offlineSources].filter(Boolean).join(' · ')

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header + channel switch ─────────────────────────────── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold t1">Overview</h1>
          <p className="text-sm t3 mt-0.5">{demo ? 'Demo data · connect Meta, Google or Shopify to see live metrics' : sourcesLabel || 'Connecting…'}</p>
        </div>
        <div className="flex items-center gap-2">
          {!demo && (campaignsLoading || creativesLoading || metaChartsLoading) && <Loader2 size={13} className="animate-spin t3" />}
          <span className="text-[11px] t3 font-medium">Channel</span>
          <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 border border-theme">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                onClick={() => setChannel(c.value)}
                className={clsx('flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
                  channel === c.value ? 'bg-indigo-600 text-white shadow-sm' : 't2 hover:t1')}
              >
                {c.label}
                {c.value === 'google' && googleStatus === 'sync_error' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Not syncing" />}
              </button>
            ))}
          </div>
          <span className="text-[11px] t3 font-medium bg-surface-2 border border-theme px-2.5 py-1 rounded-lg">{dateRange} window</span>
        </div>
      </div>

      {(channel === 'google' || channel === 'blended') && googleStatus === 'sync_error' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          <PlugZap size={14} className="shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Google Ads isn't syncing.</span> The saved connection no longer works, so Google figures show NA
            {channel === 'blended' ? ' and Blended numbers currently reflect Meta only' : ''}. Reconnect Google Ads from the client's connections to resume.
          </span>
        </div>
      )}

      {/* ── Primary cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-2">
          <div className="relative flex flex-col gap-2.5 rounded-xl border p-4 h-full bg-gradient-to-br from-indigo-600/15 to-violet-600/10 border-indigo-500/40 dark:border-indigo-500/30 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider t3 inline-flex items-center gap-1">
                {channel === 'blended' ? 'Platform ROAS' : `${CHANNEL_NAME[channel]} ROAS`}
                {ov && <MetricInfoTooltip metricId={ROAS_METRIC_ID[channel]} size="sm" />}
              </span>
              <TrendingUp size={15} className="t3" />
            </div>
            <div>
              <p className="text-4xl font-bold tracking-tight text-gradient">{channelNA ? 'NA' : metaError ? '–' : formatRoas(heroRoas)}</p>
              <p className="text-xs t3 mt-0.5">{channelNA ? naText : blendedExcludesGoogle ? 'Meta only · Google not synced' : ROAS_SUBTITLE[channel]}</p>
            </div>
            {channelNA ? null : metaError ? (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle size={12} className="shrink-0" /> Temporarily unavailable — retrying automatically
              </p>
            ) : (
              <div className="flex items-center gap-1.5">
                <TrendBadge change={demo ? mock.blendedRoas.change : delta(f.roas)} improving={(demo ? mock.blendedRoas.change : delta(f.roas)) >= 0} />
                <span className="text-[11px] t3">vs prev {dateRange}</span>
              </div>
            )}
          </div>
        </div>

        {channelNA ? naCard('Ad Spend', <IndianRupee size={15} />) : (
          <MetricCard
            label="Ad Spend" value={formatCurrency(spend)}
            subtitle={blendedExcludesGoogle ? 'Meta only · Google not synced' : CHANNEL_NAME[channel]}
            change={demo ? mock.adSpend.change : ov ? delta(f.spend) : null} improving
            icon={<IndianRupee size={15} />}
          />
        )}

        {channelNA ? naCard('Sessions', <Eye size={15} />) : (
          <MetricCard
            label="Sessions"
            value={shopify ? Math.round(sessions).toLocaleString('en-IN') : '—'}
            subtitle={shopify ? `Shopify sessions from ${chName} ads (UTM)` : 'Connect Shopify to see this'}
            change={shopify ? delta(f.sessions) : null} improving={delta(f.sessions) >= 0}
            icon={<Eye size={15} />}
            metricId={shopify ? 'metaSessions' : undefined}
          />
        )}

        {channelNA ? naCard('Attributed CPR', <Layers size={15} />) : (
          <MetricCard
            label="Attributed CPR"
            value={!shopify ? '—' : attributedOrders > 0 ? formatCurrency(cpr) : '—'}
            subtitle={!shopify
              ? 'Connect Shopify to see this'
              : attributedOrders > 0
                ? `${chName} spend ÷ ${formatNumber(attributedOrders)} of ${formatNumber(totalOrders)} Shopify orders traced to it`
                : `No Shopify orders traced to ${chName} ads in this window`}
            change={shopify && attributedOrders > 0 ? delta(f.cpr) : null}
            improving={delta(f.cpr) <= 0}
            icon={<Layers size={15} />}
            metricId={shopify ? 'attributedCPR' : undefined}
            status={shopify && attributedOrders > 0 ? getMetricStatus('attributedCPR', cpr, thresholds) : null}
          />
        )}
      </div>

      {/* ── Secondary cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {channelNA ? (
          <>
            <MetricCard size="sm" label="CTR" value="NA" subtitle={naText} change={null} improving />
            <MetricCard size="sm" label="CPM" value="NA" subtitle={naText} change={null} improving />
          </>
        ) : (
          <>
            <MetricCard size="sm" label="CTR" value={formatPercent(ctr, 2)} subtitle={chName}
              change={demo ? mock.ctr.change : ov ? delta(f.ctr) : null} improving={(demo ? mock.ctr.change : delta(f.ctr)) >= 0} />
            <MetricCard size="sm" label="CPM" value={formatCurrency(cpm, false)} subtitle={chName}
              change={demo ? mock.cpm.change : ov ? delta(f.cpm) : null} improving={(demo ? mock.cpm.change : delta(f.cpm)) <= 0} />
          </>
        )}
        <MetricCard
          size="sm" label="Conv. Rate"
          value={shopify ? formatPercent(conversionRate, 3) : '—'}
          subtitle={shopify ? 'All channels · Shopify orders ÷ sessions' : 'Connect Shopify to see this'}
          change={shopify ? delta('conversionRate') : null} improving={delta('conversionRate') >= 0}
          metricId={shopify ? 'conversionRate' : undefined}
        />
        <MetricCard
          size="sm" label="Blended ROAS"
          value={ov && shopify ? formatRoas(cur('mer')) : '—'}
          subtitle={!shopify ? 'Connect Shopify to see this' : googleStatus === 'sync_error' ? 'All channels · Shopify revenue ÷ ad spend (Google not synced)' : 'All channels · Shopify revenue ÷ ad spend'}
          change={ov && shopify ? delta('mer') : null} improving={delta('mer') >= 0}
          metricId="mer"
          status={ov && shopify ? getMetricStatus('mer', cur('mer'), thresholds) : null}
        />
      </div>

      {/* ── Trend charts, in the client's order ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="ROAS Trend" subtitle={`Daily ${chartLabel} ROAS (platform-reported) · target 4.5x`} badge={demo ? <DemoBadge /> : undefined}>
          {chartData.length > 0 ? <RoasChart data={chartData} target={4.5} lineLabel={`${chartLabel} ROAS`} /> : <ChartPlaceholder text={chartEmptyText} />}
        </ChartCard>

        <ChartCard
          title="CVR Trend"
          subtitle={`${chartLabel} purchases ÷ clicks${cvrSmoothing === '7day' ? ' · 7-day trailing average' : ' · daily'}`}
          badge={demo ? <DemoBadge /> : undefined}
          right={
            <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5 border border-theme">
              {(['daily', '7day'] as const).map((m) => (
                <button key={m} onClick={() => setCvrSmoothing(m)}
                  className={clsx('px-2 py-0.5 text-[10px] font-medium rounded transition-colors', cvrSmoothing === m ? 'bg-indigo-600 text-white' : 't3 hover:t1')}>
                  {m === 'daily' ? 'Daily' : '7D avg'}
                </button>
              ))}
            </div>
          }
        >
          {cvrChartData.length > 0 ? <ConversionRateChart data={cvrChartData} /> : <ChartPlaceholder text={chartEmptyText} />}
        </ChartCard>

        <ChartCard title="Spend vs Purchase Value Trend" subtitle={`Daily ${chartLabel} spend · platform-reported purchase value`} badge={demo ? <DemoBadge /> : undefined}>
          {chartData.length > 0 ? <SpendVsSalesChart data={chartData} spendLabel={`${chartLabel} Spend`} /> : <ChartPlaceholder text={chartEmptyText} />}
        </ChartCard>

        <ChartCard title="Spend by Creative Format" subtitle="Meta · top 25 ads by spend, last 30 days · spend and ROAS per format" badge={demo ? <DemoBadge /> : undefined}>
          {formatData.length > 0 ? <FormatBreakdownChart data={formatData} /> : <ChartPlaceholder text={metaConnected ? (creativesLoading ? 'Loading…' : 'No ad delivery in the last 30 days') : 'Connect Meta to see creative formats'} />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Funnel Conversion Rate Trend"
          subtitle="Shopify storefront · sessions → add to cart → checkout → purchase"
          right={
            <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5 border border-theme">
              {(['count', 'percent'] as const).map((m) => (
                <button key={m} onClick={() => setFunnelViewMode(m)}
                  className={clsx('px-2 py-0.5 text-[10px] font-medium rounded transition-colors', funnelViewMode === m ? 'bg-indigo-600 text-white' : 't3 hover:t1')}>
                  {m === 'count' ? 'Count' : '% of sessions'}
                </button>
              ))}
            </div>
          }
        >
          {funnelTotals.sessions > 0 ? <ProductFunnelChart data={funnelStages} mode={funnelViewMode} /> : <ChartPlaceholder text="Connect Shopify to see the storefront funnel" />}
        </ChartCard>

        <div className="card p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold t1 mb-0.5">Channel & Country Split</h3>
            <p className="text-xs t3">Ad spend by platform · Shopify revenue by country</p>
          </div>
          {(() => {
            const total = metaSpendTotal + googleSpendTotal
            const metaPct = total > 0 ? Math.round((metaSpendTotal / total) * 100) : 0
            return (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium t2">Meta Ads</span>
                  <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400">{metaPct}% · {formatCurrency(metaSpendTotal)}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${metaPct}%` }} /></div>
                {googleStatus === 'live' ? (
                  <>
                    <div className="flex items-center justify-between mt-3 mb-2">
                      <span className="text-xs font-medium t2">Google Ads</span>
                      <span className="text-xs font-bold text-amber-500">{100 - metaPct}% · {formatCurrency(googleSpendTotal)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${100 - metaPct}%` }} /></div>
                  </>
                ) : (
                  <p className="text-[10px] t3 mt-1.5">Google Ads — {googleStatus === 'sync_error' ? 'not synced (NA)' : 'not connected'}</p>
                )}
              </div>
            )
          })()}
          <div className="border-t border-theme pt-4 space-y-3">
            {countryBreakdown.length === 0 ? (
              <p className="text-[11px] t3">Connect Shopify to see revenue by country</p>
            ) : countryBreakdown.slice(0, 3).map((c, i) => {
              const p = totalCountrySales > 0 ? Math.round((c.netSales / totalCountrySales) * 100) : 0
              return (
                <div key={c.country}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium t2">{c.country}</span>
                    <span className={clsx('text-xs font-bold', ['text-orange-500', 'text-blue-500', 'text-emerald-500'][i])}>{p}% · {formatCurrency(c.netSales)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden"><div className={clsx('h-full rounded-full', ['bg-orange-400', 'bg-blue-400', 'bg-emerald-400'][i])} style={{ width: `${p}%` }} /></div>
                </div>
              )
            })}
          </div>
          {acct && (
            <div className="grid grid-cols-3 gap-3 border-t border-theme pt-4">
              {[
                { label: 'Meta Reach', value: formatNumber(acct.reach), icon: <Eye size={13} /> },
                { label: 'Meta CPM', value: formatCurrency(acct.cpm, false), icon: <BarChart2 size={13} /> },
                { label: 'Meta Clicks', value: formatNumber(acct.clicks), icon: <Globe size={13} /> },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="flex items-center justify-center gap-1 t3 mb-1">{item.icon}<span className="text-[10px] font-semibold uppercase tracking-wide">{item.label}</span></div>
                  <p className="text-sm font-bold t1">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Top Campaigns ───────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold t1">
              Top Campaigns · {CHANNEL_NAME[channel]}
              {!demo && !channelNA && <span className="ml-2 text-[10px] font-normal text-emerald-500 dark:text-emerald-400">· live · scale first</span>}
            </h3>
            <p className="text-xs t3 mt-0.5">
              {channelNA ? naText : `${topCampaigns.length} of ${campaignsForChannel.length} · click to expand Ad Sets → Ads`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 border border-theme">
              {ACTION_TAG_FILTERS.map((t) => (
                <button key={t.value} onClick={() => setTagFilter(t.value)}
                  className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors', tagFilter === t.value ? t.activeClass + ' shadow-sm' : 't2 hover:t1')}>
                  {t.label}
                </button>
              ))}
            </div>
            <Link to={channel === 'google' ? '/google' : '/meta'} className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium transition-colors">
              View all <ArrowRight size={12} />
            </Link>
          </div>
        </div>
        {!channelNA && campaignsLoadingAny && topCampaigns.length === 0 ? (
          <div className="flex items-center gap-2 text-xs t3 py-8 justify-center"><Loader2 size={14} className="animate-spin" /> Loading live campaigns…</div>
        ) : (
          <CampaignTable
            campaigns={topCampaigns}
            emptyMessage={channelNA ? `${naText} — campaigns will appear once it syncs` : demo ? 'Connect Meta or Google to see live campaigns' : 'No campaigns with delivery in this window'}
            adAccountId={metaAdAccountId}
            enableFunnelToggle
          />
        )}
      </div>

      {/* ── Top Creatives ──────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold t1">
              Top Creatives
              {metaConnected && liveCreatives.length > 0 && <span className="ml-2 text-[10px] font-normal text-emerald-500 dark:text-emerald-400">· live</span>}
            </h3>
            <p className="text-xs t3 mt-0.5">Meta · by spend · top 4</p>
          </div>
          <Link to="/creatives" className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium transition-colors">
            All creatives <ChevronRight size={12} />
          </Link>
        </div>
        {metaConnected && creativesLoading && liveCreatives.length === 0 ? (
          <div className="flex items-center gap-2 text-xs t3 py-6 justify-center"><Loader2 size={14} className="animate-spin" /> Loading creatives…</div>
        ) : topCreatives.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {topCreatives.map((cr: any, i: number) => <CreativeCard key={cr.id ?? i} creative={cr} adAccountId={metaAdAccountId} />)}
          </div>
        ) : (
          <p className="text-xs t3 py-6 text-center">Connect Meta to see top creatives</p>
        )}
      </div>

      <ReconciliationSection overview={ov} />

      {/* ── Actionables (moved to the bottom) ──────────────────── */}
      {!demo && <ActionablesTeaser />}
    </div>
  )
}
