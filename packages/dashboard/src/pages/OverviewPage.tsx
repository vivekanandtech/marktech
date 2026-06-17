import { useState } from 'react'
import {
  DollarSign, TrendingUp, Eye, MousePointer, Layers,
  Globe, BarChart2, ChevronRight, ArrowRight, Loader2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { MetricCard } from '@/components/ui/MetricCard'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { RoasChart } from '@/components/charts/RoasChart'
import { SpendVsSalesChart } from '@/components/charts/SpendVsSalesChart'
import { ConversionRateChart } from '@/components/charts/ConversionRateChart'
import { FormatBreakdownChart } from '@/components/charts/FormatBreakdownChart'
import { CreativeCard } from '@/components/creatives/CreativeCard'
import { AlertCard } from '@/components/alerts/AlertCard'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useMetaCampaigns, useMetaDailyInsights, useMetaCreatives } from '@/hooks/useMetaData'
import { getSummaryMetrics, getChartData, getFormatBreakdown, getCreatives, getAlerts } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { transformInsightMetrics, transformMetaCampaign, safeFloat, safeInt } from '@/lib/meta-transform'

// ─── Transform one daily-insights row to chart format ─────────────────────────
function toDailyChartRow(row: any) {
  const spend     = safeFloat(row.spend)
  const roasArr   = Array.isArray(row.purchase_roas) ? row.purchase_roas : []
  const roas      = roasArr.length ? safeFloat(roasArr[0]?.value) : 0
  const purchaseValue = spend * roas

  const actions  = Array.isArray(row.actions) ? row.actions : []
  const PURCHASE = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
  const purchases = actions
    .filter((a: any) => PURCHASE.includes(a.action_type))
    .reduce((s: number, a: any) => s + safeInt(a.value), 0)
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
  const format  = creative.video_id
    ? 'video'
    : creative.object_type === 'SHARE'
    ? 'carousel'
    : 'image'
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

export function OverviewPage() {
  const { clientId, dateRange, market } = useFilterStore()
  const { clients } = useClientStore()
  const connected = clients.find((c) => c.id === clientId)?.meta.connected ?? false
  const [tagFilter, setTagFilter] = useState<ActionTagFilter>('all')

  // Live Meta hooks — all are no-ops when not connected
  const { data: rawCampaigns, accountInsights, loading: campaignsLoading } = useMetaCampaigns()
  const { data: dailyRows,    loading: chartsLoading }                     = useMetaDailyInsights()
  const { data: rawAds,       loading: creativesLoading }                  = useMetaCreatives()

  // ── Mock fallbacks ─────────────────────────────────────────────────────────
  const mockMetrics   = getSummaryMetrics(clientId, market)
  const mockChartData = getChartData(clientId, dateRange, market).map(d => ({
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

  // ── Chart data — live when available, mock otherwise ──────────────────────
  const liveChartData = dailyRows.map(toDailyChartRow)
  const chartData     = connected && liveChartData.length > 0 ? liveChartData : mockChartData
  const isLiveCharts  = connected && liveChartData.length > 0

  // ── Top campaigns ─────────────────────────────────────────────────────────
  const allTransformed = rawCampaigns
    .map(transformMetaCampaign)
    .filter((c): c is NonNullable<ReturnType<typeof transformMetaCampaign>> => c !== null)

  const liveCampaigns = allTransformed
    .filter((c) => tagFilter === 'all' || c.actionTag === tagFilter)
    .sort((a, b) => (TAG_ORDER[a.actionTag ?? ''] ?? 3) - (TAG_ORDER[b.actionTag ?? ''] ?? 3) || b.roas - a.roas)
    .slice(0, 5)

  // ── Top creatives ─────────────────────────────────────────────────────────
  const liveCreatives = rawAds.slice(0, 4).map(toCreativeShape)
  const topCreatives  = connected && liveCreatives.length > 0 ? liveCreatives : mockCreatives

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
              <span className="text-[11px] font-semibold uppercase tracking-wider t3">
                {connected ? 'Meta ROAS' : 'Blended ROAS'}
              </span>
              <TrendingUp size={15} className="t3" />
            </div>
            <div>
              <p className="text-4xl font-bold tracking-tight text-gradient">{formatRoas(roas)}</p>
              <p className="text-xs t3 mt-0.5">{connected ? 'Facebook & Instagram' : 'across Meta + Google'}</p>
            </div>
            {!connected && (
              <div className="flex items-center gap-1.5">
                <TrendBadge change={mockMetrics.blendedRoas.change} improving={mockMetrics.blendedRoas.improving} />
                <span className="text-[11px] t3">vs prev period</span>
              </div>
            )}
          </div>
        </div>
        <MetricCard label="Ad Spend" value={formatCurrency(spend)} change={connected ? 0 : mockMetrics.adSpend.change} improving={mockMetrics.adSpend.improving} icon={<DollarSign size={15} />} />
        <MetricCard label="Reach"    value={formatNumber(reach)}   change={connected ? 0 : mockMetrics.reach.change}   improving={mockMetrics.reach.improving}   icon={<Eye size={15} />} />
        <MetricCard label="Avg CPA"  value={formatCurrency(cpa)}   change={connected ? 0 : mockMetrics.cpa.change}     improving={mockMetrics.cpa.improving}     icon={<Layers size={15} />} />
      </div>

      {/* ── Secondary metrics ───────────────────────────────────── */}
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
        <MetricCard size="sm" label="AoV"         value={formatCurrency(mockMetrics.aov.value)}            change={mockMetrics.aov.change}              improving={mockMetrics.aov.improving} />
        <MetricCard size="sm" label="Sessions"    value={formatNumber(mockMetrics.sessions.value)}         change={mockMetrics.sessions.change}         improving={mockMetrics.sessions.improving} />
        <MetricCard size="sm" label="CM Ratio"    value={formatPercent(mockMetrics.cmRatio.value)}         change={mockMetrics.cmRatio.change}          improving={mockMetrics.cmRatio.improving} />
        <MetricCard size="sm" label="New Cust %"  value={formatPercent(mockMetrics.newCustomerRate.value)} change={mockMetrics.newCustomerRate.change}   improving={mockMetrics.newCustomerRate.improving} />
      </div>

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

      {/* ── Top Campaigns ───────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold t1">
              Top Campaigns
              {connected && <span className="ml-2 text-[10px] font-normal text-emerald-500 dark:text-emerald-400">· live · scale first</span>}
            </h3>
            <p className="text-xs t3 mt-0.5">
              {connected
                ? `${liveCampaigns.length} of ${allTransformed.length} · click to expand Ad Sets → Ads`
                : 'Connect Meta to see live campaigns'}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <Link to="/meta" className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-medium transition-colors">
              View all <ArrowRight size={12} />
            </Link>
          </div>
        </div>
        {connected && campaignsLoading && liveCampaigns.length === 0 ? (
          <div className="flex items-center gap-2 text-xs t3 py-8 justify-center">
            <Loader2 size={14} className="animate-spin" /> Loading live campaigns…
          </div>
        ) : (
          <CampaignTable
            campaigns={connected ? liveCampaigns : []}
            emptyMessage={connected ? 'Loading campaigns…' : 'Connect Meta to see live campaigns'}
          />
        )}
      </div>

      {/* ── CVR + Top Creatives ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">CVR Trend</h3>
            {!isLiveCharts && <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo</span>}
          </div>
          <p className="text-xs t3 mb-4">Purchases ÷ link clicks · daily</p>
          <ConversionRateChart data={chartData} />
        </div>

        <div className="card p-4 lg:col-span-2">
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
              {topCreatives.map((cr, i) => <CreativeCard key={cr.id ?? i} creative={cr} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Spend & Market split ─────────────────────────────────── */}
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
            <h3 className="text-sm font-semibold t1 mb-0.5">Channel & Market Split</h3>
            <p className="text-xs t3">Meta budget allocation</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium t2">Meta Ads</span>
              <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400">100% · {formatCurrency(spend)}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full w-full" />
            </div>
            <p className="text-[10px] t3 mt-1.5">Google Ads — not connected</p>
          </div>
          <div className="border-t border-theme pt-4 space-y-3">
            {[
              { flag: '🇮🇳', label: 'India',         pct: 72, color: 'text-orange-500', bg: 'bg-orange-400' },
              { flag: '🌍', label: 'International',  pct: 28, color: 'text-blue-500',   bg: 'bg-blue-400'   },
            ].map(m => (
              <div key={m.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium t2">{m.flag} {m.label}</span>
                  <span className={`text-xs font-bold ${m.color}`}>{m.pct}% · {formatCurrency(spend * m.pct / 100)}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div className={`h-full ${m.bg} rounded-full`} style={{ width: `${m.pct}%` }} />
                </div>
              </div>
            ))}
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
