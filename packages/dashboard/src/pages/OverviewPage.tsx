import { useState } from 'react'
import {
  IndianRupee, TrendingUp, Eye, MousePointer, Layers,
  Globe, BarChart2, ChevronRight, ArrowRight, Loader2, AlertTriangle,
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
import { AlertCard } from '@/components/alerts/AlertCard'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { InsightsPanel } from '@/components/insights/InsightsPanel'
import { CrossChannelInsightsTeaser } from '@/components/insights/CrossChannelInsightsTeaser'
import { ReconciliationSection } from '@/components/reconciliation/ReconciliationSection'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useMetaCampaigns, useMetaDailyInsights, useMetaCreatives } from '@/hooks/useMetaData'
import { useGoogleCampaigns } from '@/hooks/useGoogleData'
import { useOverviewMetrics } from '@/hooks/useOverviewMetrics'
import { useProductPerformance } from '@/hooks/useProductPerformance'
import { getMetricStatus } from '@/lib/metric-thresholds'
import { getSummaryMetrics, getChartData, getFormatBreakdown, getCreatives, getAlerts } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { transformInsightMetrics, transformMetaCampaign, safeFloat, safeInt, classifyCreativeFormat } from '@/lib/meta-transform'
import { transformGoogleCampaign } from '@/lib/google-transform'
import { maxActionCount, PURCHASE_ACTION_TYPES } from '@/lib/meta-actions'
import { InsightsPayload } from '@/store/insightsStore'

// ─── Transform one daily-insights row to chart format ─────────────────────────
function toDailyChartRow(row: any) {
  const spend     = safeFloat(row.spend)
  const roasArr   = Array.isArray(row.purchase_roas) ? row.purchase_roas : []
  const roas      = roasArr.length ? safeFloat(roasArr[0]?.value) : 0
  const purchaseValue = spend * roas

  const purchases = maxActionCount(row, PURCHASE_ACTION_TYPES)
  const clicksN  = safeInt(row.clicks)
  const cvr      = clicksN > 0 && purchases > 0 ? (purchases / clicksN) * 100 : 0

  const d    = new Date(row.date_start)
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  return {
    date,
    metaSpend:      Math.round(spend),
    purchaseValue:  Math.round(purchaseValue),
    roas:           parseFloat(roas.toFixed(2)),
    conversionRate: parseFloat(cvr.toFixed(2)),
  }
}

// ─── Transform raw top-ad into CreativeCard shape ─────────────────────────────
function toCreativeShape(ad: any, idx: number) {
  const ins     = ad.insights?.data?.[0] ?? null
  const metrics = transformInsightMetrics(ins)
  const creative = ad.creative ?? {}
  const format  = classifyCreativeFormat(creative)
  return {
    id:             ad.id ?? String(idx),
    name:           ad.name ?? 'Unnamed ad',
    format,
    thumbnailUrl:   creative.thumbnail_url ?? creative.image_url ?? '',
    spend:          metrics.spend,
    roas:           metrics.roas,
    ctr:            metrics.ctr,
    cpa:            metrics.cpa,
    frequency:      metrics.frequency,
    trend:          0,
    isTopPerformer: metrics.roas >= 3.5,
    fatigueRisk:    metrics.frequency >= 3,
  }
}

type ActionTagFilter = 'all' | 'scale' | 'watch' | 'optimise'
const ACTION_TAG_FILTERS: { value: ActionTagFilter; label: string; activeClass: string }[] = [
  { value: 'all',      label: 'All',      activeClass: 'bg-slate-600 text-white' },
  { value: 'scale',    label: '↑ Scale',    activeClass: 'bg-emerald-500 text-white' },
  { value: 'watch',    label: '◎ Watch',    activeClass: 'bg-amber-500 text-white' },
  { value: 'optimise', label: '⚙ Optimise', activeClass: 'bg-blue-500 text-white' },
]
const TAG_ORDER: Record<string, number> = { scale: 0, watch: 1, optimise: 2 }

type PlatformView = 'meta' | 'google' | 'blended'
const PLATFORM_VIEWS: { value: PlatformView; label: string }[] = [
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
  { value: 'blended', label: 'Blended' },
]

export function OverviewPage() {
  const { clientId, dateRange, country } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const connected = currentClient?.meta.connected ?? false
  const googleConnected = currentClient?.google?.connected ?? false
  const metaAdAccountId = currentClient?.metaAdAccountId ?? null
  const thresholds = currentClient?.settings.thresholds
  const [tagFilter, setTagFilter] = useState<ActionTagFilter>('all')
  const [platformView, setPlatformView] = useState<PlatformView>('meta')
  const [cvrSmoothing, setCvrSmoothing] = useState<'daily' | '7day'>('daily')
  const [funnelViewMode, setFunnelViewMode] = useState<'count' | 'percent'>('count')

  // Live Meta hooks — all are no-ops when not connected
  const { data: rawCampaigns, accountInsights, loading: campaignsLoading } = useMetaCampaigns()
  const { data: dailyRows,    loading: chartsLoading }                     = useMetaDailyInsights()
  const { data: rawAds,       loading: creativesLoading }                  = useMetaCreatives()
  // Google campaigns — same no-op-when-disconnected contract as the Meta hooks above.
  const { data: rawGoogleCampaigns, loading: googleCampaignsLoading }      = useGoogleCampaigns()

  // ── Mock fallbacks ─────────────────────────────────────────────────────────
  // mock-data.ts still speaks the old 'all'|'india'|'international' vocabulary —
  // translate the real country filter into it rather than rewriting the mock module.
  const mockMarket = country === 'all' ? 'all' : country === 'India' ? 'india' : 'international'
  const mockMetrics   = getSummaryMetrics(clientId, mockMarket)
  const mockChartData = getChartData(clientId, dateRange, mockMarket).map(d => ({
    ...d, purchaseValue: d.netSales ?? 0,
  }))
  const formatData    = getFormatBreakdown(clientId)
  const mockCreatives = getCreatives(clientId).slice(0, 4)
  const alerts        = getAlerts(clientId).filter((a) => !a.isRead)

  // ── Live KPIs ──────────────────────────────────────────────────────────────
  const acct        = accountInsights ? transformInsightMetrics(accountInsights) : null
  const spend       = connected ? (acct?.spend        ?? 0) : mockMetrics.adSpend.value
  const roas        = connected ? (acct?.roas          ?? 0) : mockMetrics.blendedRoas.value
  const reach       = connected ? (acct?.reach         ?? 0) : mockMetrics.reach.value
  const ctr         = connected ? (acct?.ctr           ?? 0) : mockMetrics.ctr.value
  const cpa         = connected ? (acct?.cpa           ?? 0) : mockMetrics.cpa.value
  const cpm         = connected ? (acct?.cpm           ?? 0) : mockMetrics.cpm.value
  const impressions = connected ? (acct?.impressions   ?? 0) : 0
  const clicks      = connected ? (acct?.clicks        ?? 0) : 0

  // ── Cross-channel truth metrics (Shopify-attributed, not platform-reported) ──
  const { data: overview, connectedSomewhere } = useOverviewMetrics()
  const sessions        = overview?.current.metaSessions ?? 0
  const sessionsDelta    = overview?.deltas.metaSessions ?? 0
  const attributedCPR   = overview?.current.attributedCPR ?? 0
  const attributedCPRDelta = overview?.deltas.attributedCPR ?? 0
  const mer             = overview?.current.mer ?? 0
  const merDelta         = overview?.deltas.mer ?? 0
  const nCAC             = overview?.current.nCAC ?? 0
  const nCACAvailable    = overview?.current.newCustomerDataAvailable ?? false
  const nCACDelta        = overview?.deltas.nCAC ?? 0
  const overClaim        = overview?.current.overClaimMultiplier ?? 0
  const googleSpend      = overview?.current.googleSpend ?? 0
  const countryBreakdown = overview?.countryBreakdown ?? []
  const totalCountrySpend = countryBreakdown.reduce((s, c) => s + c.netSales, 0)
  const conversionRate      = overview?.current.conversionRate ?? 0
  const conversionRateDelta = overview?.deltas.conversionRate ?? 0

  // ── Per-platform ROAS (toggle: Meta / Google / Blended) ───────────────────
  const platformRoas = {
    meta: overview?.current.metaRoas ?? 0,
    google: overview?.current.googleRoas ?? 0,
    blended: overview?.current.blendedRoas ?? 0,
  }
  const heroRoasLabel = { meta: 'Meta ROAS', google: 'Google ROAS', blended: 'Blended ROAS' }[platformView]
  const heroRoasSubtitle = {
    meta: 'Facebook & Instagram · platform-reported',
    google: 'Google Ads · platform-reported',
    blended: 'Shopify truth ÷ Meta + Google spend',
  }[platformView]
  const heroRoas = overview ? platformRoas[platformView] : roas
  // A live Meta/Google API failure (e.g. Meta's usage throttle) makes
  // metaRoas/googleRoas come back as a plain 0 — indistinguishable from a
  // real zero-spend period unless we check platformErrors directly. Surface
  // it explicitly instead of silently rendering "–" like a genuine zero.
  const heroRoasError = overview?.platformErrors
    ? (platformView === 'meta' ? overview.platformErrors.meta
      : platformView === 'google' ? overview.platformErrors.google
      : overview.platformErrors.meta || overview.platformErrors.google)
    : null
  const platformRoasDelta = {
    meta: overview?.deltas.metaRoas ?? 0,
    google: overview?.deltas.googleRoas ?? 0,
    blended: overview?.deltas.blendedRoas ?? 0,
  }
  const heroRoasDelta = overview ? platformRoasDelta[platformView] : mockMetrics.blendedRoas.change

  // ── Chart data — live when available, mock otherwise ──────────────────────
  const liveChartData = dailyRows.map(toDailyChartRow)
  const chartData     = connected && liveChartData.length > 0 ? liveChartData : mockChartData
  const isLiveCharts  = connected && liveChartData.length > 0

  // 7-day trailing average — smooths day-to-day noise in the CVR line without
  // a new API call; falls back to the raw value for the first few points.
  const cvrChartData = cvrSmoothing === 'daily'
    ? chartData
    : chartData.map((d, i) => {
        const window = chartData.slice(Math.max(0, i - 6), i + 1)
        const avg = window.reduce((s, w) => s + (w.conversionRate ?? 0), 0) / window.length
        return { ...d, conversionRate: parseFloat(avg.toFixed(2)) }
      })

  // ── Product behaviour funnel (real Shopify site traffic, no ad spend implied) ──
  const { data: productData } = useProductPerformance()
  const funnelTotals = (productData?.products ?? []).reduce((acc, p) => ({
    sessions: acc.sessions + p.sessions,
    addToCart: acc.addToCart + p.addToCart,
    checkoutsInitiated: acc.checkoutsInitiated + p.checkoutsInitiated,
    orders: acc.orders + p.shopifyOrders,
  }), { sessions: 0, addToCart: 0, checkoutsInitiated: 0, orders: 0 })
  const funnelStages: ProductFunnelStage[] = funnelViewMode === 'count'
    ? [
        { stage: 'Sessions',  value: funnelTotals.sessions },
        { stage: 'Add to Cart', value: funnelTotals.addToCart },
        { stage: 'Checkout',  value: funnelTotals.checkoutsInitiated },
        { stage: 'Purchase',  value: funnelTotals.orders },
      ]
    : [
        { stage: 'Sessions',  value: funnelTotals.sessions > 0 ? 100 : 0 },
        { stage: 'Add to Cart', value: funnelTotals.sessions > 0 ? (funnelTotals.addToCart / funnelTotals.sessions) * 100 : 0 },
        { stage: 'Checkout',  value: funnelTotals.sessions > 0 ? (funnelTotals.checkoutsInitiated / funnelTotals.sessions) * 100 : 0 },
        { stage: 'Purchase',  value: funnelTotals.sessions > 0 ? (funnelTotals.orders / funnelTotals.sessions) * 100 : 0 },
      ]
  const hasFunnelData = funnelTotals.sessions > 0

  // ── Top campaigns ─────────────────────────────────────────────────────────
  const allTransformed = rawCampaigns
    .map(transformMetaCampaign)
    .filter((c): c is NonNullable<ReturnType<typeof transformMetaCampaign>> => c !== null)

  const googleTransformed = rawGoogleCampaigns.map(transformGoogleCampaign)

  const campaignsForPlatform =
    platformView === 'meta' ? allTransformed :
    platformView === 'google' ? googleTransformed :
    [...allTransformed, ...googleTransformed]

  const showCampaignsSection = connected || googleConnected

  const liveCampaigns = campaignsForPlatform
    .filter((c) => tagFilter === 'all' || c.actionTag === tagFilter)
    .sort((a, b) => (TAG_ORDER[a.actionTag ?? ''] ?? 3) - (TAG_ORDER[b.actionTag ?? ''] ?? 3) || b.roas - a.roas)
    .slice(0, 5)

  // ── Top creatives ─────────────────────────────────────────────────────────
  const liveCreatives = rawAds.slice(0, 4).map(toCreativeShape)
  const topCreatives  = connected && liveCreatives.length > 0 ? liveCreatives : mockCreatives

  // ── AI Insights payload — built from data already fetched above, sent to
  // the backend (which calls the LLM) only when the owner clicks "Generate" ──
  const allCreativesForInsights = rawAds.map(toCreativeShape)
  const insightsPayload: InsightsPayload | null = connected && acct
    ? {
        account: {
          spend: acct.spend, roas: acct.roas, ctr: acct.ctr, cpa: acct.cpa,
          cpm: acct.cpm, reach: acct.reach, impressions: acct.impressions, clicks: acct.clicks,
        },
        campaigns: allTransformed.map((c) => ({
          id: c.id, name: c.name, spend: c.spend, roas: c.roas, ctr: c.ctr, cpa: c.cpa,
          frequency: c.frequency, conversions: c.conversions, objective: c.objective, status: c.status,
        })),
        creatives: allCreativesForInsights.map((cr) => ({
          id: cr.id, name: cr.name, format: cr.format, spend: cr.spend, roas: cr.roas,
          ctr: cr.ctr, frequency: cr.frequency,
        })),
      }
    : null

  const loading = campaignsLoading || chartsLoading || creativesLoading

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold t1">Overview</h1>
          <p className="text-sm t3 mt-0.5">
            {connected ? 'Live Meta data' : 'Demo data · Connect Meta to see live metrics'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected && loading && <Loader2 size={13} className="animate-spin t3" />}
          {connected && (
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">Live</span>
          )}
          <span className="text-[11px] t3 font-medium bg-surface-2 border border-theme px-2.5 py-1 rounded-lg">{dateRange} window</span>
        </div>
      </div>

      {/* ── Hero KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-2">
          <div className="relative flex flex-col gap-2.5 rounded-xl border p-4 h-full bg-gradient-to-br from-indigo-600/15 to-violet-600/10 border-indigo-500/40 dark:border-indigo-500/30 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider t3 inline-flex items-center gap-1">
                {overview ? heroRoasLabel : (connected ? 'Meta ROAS' : 'Blended ROAS')}
                {overview && <MetricInfoTooltip metricId={`${platformView}Roas`} size="sm" />}
              </span>
              {overview ? (
                <div className="flex items-center gap-0.5 bg-white/40 dark:bg-black/20 rounded-md p-0.5">
                  {PLATFORM_VIEWS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPlatformView(p.value)}
                      className={clsx(
                        'px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors',
                        platformView === p.value ? 'bg-indigo-600 text-white' : 't3 hover:t1'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <TrendingUp size={15} className="t3" />
              )}
            </div>
            <div>
              <p className="text-4xl font-bold tracking-tight text-gradient">{heroRoasError ? '–' : formatRoas(overview ? heroRoas : roas)}</p>
              <p className="text-xs t3 mt-0.5">{overview ? heroRoasSubtitle : (connected ? 'Facebook & Instagram' : 'across Meta + Google')}</p>
            </div>
            {heroRoasError ? (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle size={12} className="shrink-0" />
                Temporarily unavailable — retrying automatically
              </p>
            ) : (
              <div className="flex items-center gap-1.5">
                <TrendBadge change={heroRoasDelta} improving={heroRoasDelta >= 0} />
                <span className="text-[11px] t3">vs prev period</span>
              </div>
            )}
          </div>
        </div>
        <MetricCard label="Ad Spend" value={formatCurrency(spend)} change={connected ? 0 : mockMetrics.adSpend.change} improving={mockMetrics.adSpend.improving} icon={<IndianRupee size={15} />} />
        <MetricCard
          label="Sessions"
          value={overview?.connected.shopify ? formatNumber(sessions) : '—'}
          subtitle={overview?.connected.shopify ? 'from Meta (UTM-attributed)' : 'Connect Shopify to see this'}
          change={sessionsDelta} improving={sessionsDelta >= 0}
          icon={<Eye size={15} />}
          metricId={overview?.connected.shopify ? 'metaSessions' : undefined}
        />
        <MetricCard
          label="Attributed CPR"
          value={overview?.connected.shopify ? formatCurrency(attributedCPR) : (connected ? formatCurrency(cpa) : formatCurrency(mockMetrics.cpa.value))}
          subtitle={overview?.connected.shopify ? 'Meta spend ÷ Shopify orders' : undefined}
          change={overview?.connected.shopify ? attributedCPRDelta : (connected ? 0 : mockMetrics.cpa.change)}
          improving={overview?.connected.shopify ? attributedCPRDelta <= 0 : mockMetrics.cpa.improving}
          icon={<Layers size={15} />}
          metricId={overview?.connected.shopify ? 'attributedCPR' : undefined}
          status={overview?.connected.shopify ? getMetricStatus('attributedCPR', attributedCPR, thresholds) : null}
        />
      </div>

      {/* ── Secondary metrics — right below hero KPIs, all key numbers together ── */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        <MetricCard size="sm" label="CTR"        value={formatPercent(ctr)}                                            change={connected ? 0 : mockMetrics.ctr.change}             improving={mockMetrics.ctr.improving} />
        <MetricCard size="sm" label="CPM"        value={formatCurrency(cpm)}                                           change={connected ? 0 : mockMetrics.cpm.change}             improving={mockMetrics.cpm.improving} />
        {connected ? (
          <>
            <MetricCard size="sm" label="Impressions" value={formatNumber(impressions)} change={0} improving />
            <MetricCard size="sm" label="Clicks"      value={formatNumber(clicks)}      change={0} improving />
          </>
        ) : (
          <>
            <MetricCard size="sm" label="Attrib. ROAS" value={formatRoas(mockMetrics.attributedRoas.value)}   change={mockMetrics.attributedRoas.change} improving={mockMetrics.attributedRoas.improving} />
            <MetricCard size="sm" label="CAC"           value={formatCurrency(mockMetrics.cac.value)}          change={mockMetrics.cac.change}            improving={mockMetrics.cac.improving} />
          </>
        )}
        <MetricCard
          size="sm" label="Conv. Rate"
          value={overview?.connected.shopify ? formatPercent(conversionRate) : '—'}
          subtitle={overview?.connected.shopify ? 'total orders ÷ total sessions' : undefined}
          change={conversionRateDelta} improving={conversionRateDelta >= 0}
          metricId={overview?.connected.shopify ? 'conversionRate' : undefined}
        />
        <MetricCard
          size="sm" label="MER"
          value={overview ? formatRoas(mer) : '—'}
          change={merDelta} improving={merDelta >= 0}
          metricId="mer"
          status={overview ? getMetricStatus('mer', mer, thresholds) : null}
        />
        <MetricCard
          size="sm" label="New-Cust CAC"
          value={nCACAvailable ? formatCurrency(nCAC) : '—'}
          change={nCACAvailable ? nCACDelta : 0} improving={nCACAvailable ? nCACDelta <= 0 : true}
          metricId="nCAC"
          status={nCACAvailable ? getMetricStatus('nCAC', nCAC, thresholds) : null}
        />
        <MetricCard
          size="sm" label="Platform Over-claim"
          value={overview && overview.current.shopifyNetRevenue > 0 ? `${overClaim.toFixed(1)}×` : '—'}
          change={0} improving
          metricId="overClaimMultiplier"
          status={overview && overview.current.shopifyNetRevenue > 0 ? getMetricStatus('overClaimMultiplier', overClaim, thresholds) : null}
        />
      </div>
      {overview && !nCACAvailable && overview.connected.shopify && (
        <p className="text-[11px] t3 -mt-3">
          New-Customer CAC needs one more Shopify permission — <Link to="/settings" className="text-indigo-500 hover:underline">reconnect Shopify</Link> to enable it.
        </p>
      )}

      {/* ── AI Insights ─────────────────────────────────────────── */}
      {connectedSomewhere && <CrossChannelInsightsTeaser clientId={clientId} />}

      {connected && <InsightsPanel payload={insightsPayload} adAccountId={metaAdAccountId} />}

      {/* ── Charts ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">Meta Spend vs Purchase Value</h3>
            {!isLiveCharts && <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo</span>}
          </div>
          <p className="text-xs t3 mb-4">Daily ad spend · attributed purchase value (spend × ROAS)</p>
          <SpendVsSalesChart data={chartData} />
        </div>
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">ROAS Trend</h3>
            {!isLiveCharts && <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo</span>}
          </div>
          <p className="text-xs t3 mb-4">Daily Meta ROAS · target 4.5x</p>
          <RoasChart data={chartData.map(d => ({ ...d, roas: (d as any).roas ?? (d as any).blendedRoas ?? 0 }))} target={4.5} />
        </div>
      </div>

      {/* ── CVR Trend + Product Behaviour ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">CVR Trend</h3>
            <div className="flex items-center gap-1.5">
              {!isLiveCharts && <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo</span>}
              <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5 border border-theme">
                {(['daily', '7day'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setCvrSmoothing(m)}
                    className={clsx(
                      'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
                      cvrSmoothing === m ? 'bg-indigo-600 text-white' : 't3 hover:t1'
                    )}
                  >
                    {m === 'daily' ? 'Daily' : '7D avg'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs t3 mb-4">Purchases ÷ link clicks{cvrSmoothing === '7day' ? ' · 7-day trailing average' : ' · daily'}</p>
          <ConversionRateChart data={cvrChartData} />
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">Product Behaviour</h3>
            <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5 border border-theme">
              {(['count', 'percent'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setFunnelViewMode(m)}
                  className={clsx(
                    'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
                    funnelViewMode === m ? 'bg-indigo-600 text-white' : 't3 hover:t1'
                  )}
                >
                  {m === 'count' ? 'Count' : '% of sessions'}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs t3 mb-4">
            Sessions → cart → checkout → purchase · real Shopify site traffic, no ad spend implied
          </p>
          {hasFunnelData ? (
            <ProductFunnelChart data={funnelStages} mode={funnelViewMode} />
          ) : (
            <div className="flex items-center justify-center h-[220px] t3 text-sm">
              Connect Shopify to see product behaviour
            </div>
          )}
        </div>
      </div>

      {/* ── Spend & Country split ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">Spend by Creative Format</h3>
            <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo</span>
          </div>
          <p className="text-xs t3 mb-4">Distribution + ROAS by format</p>
          <FormatBreakdownChart data={formatData} />
        </div>

        <div className="card p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold t1 mb-0.5">Channel & Country Split</h3>
            <p className="text-xs t3">Ad spend by platform · revenue by country</p>
          </div>
          <div>
            {(() => {
              const totalAdSpend = spend + googleSpend
              const metaPct = totalAdSpend > 0 ? Math.round((spend / totalAdSpend) * 100) : (spend > 0 ? 100 : 0)
              const googlePct = 100 - metaPct
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium t2">Meta Ads</span>
                    <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400">{metaPct}% · {formatCurrency(spend)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${metaPct}%` }} />
                  </div>
                  {overview?.connected.google ? (
                    <>
                      <div className="flex items-center justify-between mt-3 mb-2">
                        <span className="text-xs font-medium t2">Google Ads</span>
                        <span className="text-xs font-bold text-amber-500">{googlePct}% · {formatCurrency(googleSpend)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${googlePct}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px] t3 mt-1.5">Google Ads — not connected</p>
                  )}
                </>
              )
            })()}
          </div>
          <div className="border-t border-theme pt-4 space-y-3">
            {countryBreakdown.length === 0 ? (
              <p className="text-[11px] t3">Connect Shopify to see revenue by country</p>
            ) : (
              countryBreakdown.slice(0, 3).map((c, i) => {
                const pct = totalCountrySpend > 0 ? Math.round((c.netSales / totalCountrySpend) * 100) : 0
                const bars = ['bg-orange-400', 'bg-blue-400', 'bg-emerald-400']
                const colors = ['text-orange-500', 'text-blue-500', 'text-emerald-500']
                return (
                  <div key={c.country}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium t2">{c.country}</span>
                      <span className={`text-xs font-bold ${colors[i]}`}>{pct}% · {formatCurrency(c.netSales)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div className={`h-full ${bars[i]} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-theme pt-4">
            {[
              { label: 'Reach',  value: formatNumber(reach), icon: <Eye size={13} /> },
              { label: 'CPM',    value: formatCurrency(cpm), icon: <BarChart2 size={13} /> },
              { label: 'Clicks', value: formatNumber(clicks || mockMetrics.sessions.value), icon: <Globe size={13} /> },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className="flex items-center justify-center gap-1 t3 mb-1">
                  {item.icon}
                  <span className="text-[10px] font-semibold uppercase tracking-wide">{item.label}</span>
                </div>
                <p className="text-sm font-bold t1">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Top Campaigns ───────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold t1">
              Top Campaigns
              {showCampaignsSection && <span className="ml-2 text-[10px] font-normal text-emerald-500 dark:text-emerald-400">· live · scale first</span>}
            </h3>
            <p className="text-xs t3 mt-0.5">
              {showCampaignsSection
                ? `${liveCampaigns.length} of ${campaignsForPlatform.length} · click to expand Ad Sets → Ads`
                : 'Connect Meta or Google to see live campaigns'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 border border-theme">
              {PLATFORM_VIEWS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPlatformView(p.value)}
                  className={clsx(
                    'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                    platformView === p.value ? 'bg-indigo-600 text-white shadow-sm' : 't2 hover:t1'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 border border-theme">
              {ACTION_TAG_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTagFilter(f.value)}
                  className={clsx(
                    'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                    tagFilter === f.value ? f.activeClass + ' shadow-sm' : 't2 hover:t1'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Link to={platformView === 'google' ? '/google' : '/meta'} className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-medium transition-colors">
              View all <ArrowRight size={12} />
            </Link>
          </div>
        </div>
        {showCampaignsSection && (campaignsLoading || googleCampaignsLoading) && liveCampaigns.length === 0 ? (
          <div className="flex items-center gap-2 text-xs t3 py-8 justify-center">
            <Loader2 size={14} className="animate-spin" /> Loading live campaigns…
          </div>
        ) : (
          <CampaignTable
            campaigns={showCampaignsSection ? liveCampaigns : []}
            emptyMessage={showCampaignsSection ? 'Loading campaigns…' : 'Connect Meta or Google to see live campaigns'}
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
              {connected && liveCreatives.length > 0 && <span className="ml-2 text-[10px] font-normal text-emerald-500 dark:text-emerald-400">· live</span>}
            </h3>
            <p className="text-xs t3 mt-0.5">By spend · Top 4</p>
          </div>
          <Link to="/creatives" className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium transition-colors">
            All creatives <ChevronRight size={12} />
          </Link>
        </div>
        {connected && creativesLoading && liveCreatives.length === 0 ? (
          <div className="flex items-center gap-2 text-xs t3 py-6 justify-center">
            <Loader2 size={14} className="animate-spin" /> Loading creatives…
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {topCreatives.map((cr, i) => <CreativeCard key={cr.id ?? i} creative={cr} adAccountId={metaAdAccountId} />)}
          </div>
        )}
      </div>

      <ReconciliationSection overview={overview} />

      {/* ── Alerts ──────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold t1">Active Alerts</h3>
              <p className="text-xs t3 mt-0.5">{alerts.length} requiring attention</p>
            </div>
            <Link to="/alerts" className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium transition-colors">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
          </div>
        </div>
      )}
    </div>
  )
}
