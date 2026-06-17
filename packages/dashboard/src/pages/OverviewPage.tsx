import {
  DollarSign, TrendingUp, Eye, MousePointer, Layers,
  Globe, BarChart2, ChevronRight, ArrowRight, Loader2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
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
import { useMetaCampaigns } from '@/hooks/useMetaData'
import { getSummaryMetrics, getChartData, getFormatBreakdown, getCreatives, getAlerts } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { transformInsightMetrics, transformMetaCampaign } from '@/lib/meta-transform'

export function OverviewPage() {
  const { clientId, dateRange, market } = useFilterStore()
  const { clients } = useClientStore()
  const connected = clients.find((c) => c.id === clientId)?.meta.connected ?? false

  // Always call the hook (no conditional hooks) — returns empty data when not connected
  const { data: rawCampaigns, accountInsights, loading } = useMetaCampaigns()

  // Mock data (used for charts and metrics we can't get from Meta alone)
  const mockMetrics  = getSummaryMetrics(clientId, market)
  const chartData    = getChartData(clientId, dateRange, market)
  const formatData   = getFormatBreakdown(clientId)
  const mockCreatives = getCreatives(clientId).slice(0, 4)
  const alerts       = getAlerts(clientId).filter((a) => !a.isRead)

  // Live Meta data
  const acct = accountInsights ? transformInsightMetrics(accountInsights) : null
  const liveCampaigns = rawCampaigns
    .map(transformMetaCampaign)
    .filter((c): c is NonNullable<ReturnType<typeof transformMetaCampaign>> => c !== null)
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 5)

  // KPI values — real when connected, mock otherwise
  const spend = connected ? (acct?.spend ?? 0) : mockMetrics.adSpend.value
  const roas  = connected ? (acct?.roas  ?? 0) : mockMetrics.blendedRoas.value
  const reach = connected ? (acct?.reach ?? 0) : mockMetrics.reach.value
  const ctr   = connected ? (acct?.ctr   ?? 0) : mockMetrics.ctr.value
  const cpa   = connected ? (acct?.cpa   ?? 0) : mockMetrics.cpa.value
  const cpm   = connected ? (acct?.cpm   ?? 0) : mockMetrics.cpm.value

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold t1">Overview</h1>
          <p className="text-sm t3 mt-0.5">
            {connected ? 'Live Meta data' : 'All channels · All campaigns'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected && loading && <Loader2 size={13} className="animate-spin t3" />}
          {connected && (
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
              Live
            </span>
          )}
          <span className="text-[11px] t3 font-medium bg-surface-2 border border-theme px-2.5 py-1 rounded-lg">{dateRange} window</span>
        </div>
      </div>

      {/* ── Hero KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-2">
          <div className="relative flex flex-col gap-2.5 rounded-xl border p-4 transition-all h-full bg-gradient-to-br from-indigo-600/15 to-violet-600/10 border-indigo-500/40 dark:border-indigo-500/30 shadow-sm">
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
        <MetricCard size="sm" label="CTR"        value={formatPercent(ctr)}                                     change={connected ? 0 : mockMetrics.ctr.change}             improving={mockMetrics.ctr.improving} />
        <MetricCard size="sm" label="CPM"        value={formatCurrency(cpm)}                                    change={connected ? 0 : mockMetrics.cpm.change}             improving={mockMetrics.cpm.improving} />
        {connected ? (
          <>
            <MetricCard size="sm" label="Impressions" value={formatNumber(acct?.impressions ?? 0)} change={0} improving />
            <MetricCard size="sm" label="Clicks"      value={formatNumber(acct?.clicks ?? 0)}      change={0} improving />
          </>
        ) : (
          <>
            <MetricCard size="sm" label="Attrib. ROAS" value={formatRoas(mockMetrics.attributedRoas.value)}    change={mockMetrics.attributedRoas.change} improving={mockMetrics.attributedRoas.improving} />
            <MetricCard size="sm" label="CAC"           value={formatCurrency(mockMetrics.cac.value)}           change={mockMetrics.cac.change}            improving={mockMetrics.cac.improving} />
          </>
        )}
        <MetricCard size="sm" label="AoV"           value={formatCurrency(mockMetrics.aov.value)}              change={mockMetrics.aov.change}              improving={mockMetrics.aov.improving} />
        <MetricCard size="sm" label="Sessions"      value={formatNumber(mockMetrics.sessions.value)}           change={mockMetrics.sessions.change}         improving={mockMetrics.sessions.improving} />
        <MetricCard size="sm" label="CM Ratio"      value={formatPercent(mockMetrics.cmRatio.value)}           change={mockMetrics.cmRatio.change}          improving={mockMetrics.cmRatio.improving} />
        <MetricCard size="sm" label="New Cust %"    value={formatPercent(mockMetrics.newCustomerRate.value)}   change={mockMetrics.newCustomerRate.change}   improving={mockMetrics.newCustomerRate.improving} />
      </div>

      {/* ── Charts — demo data ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">Ad Spend vs Net Sales</h3>
            {connected && <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo chart</span>}
          </div>
          <p className="text-xs t3 mb-4">Meta + Google spend stacked · Net sales line</p>
          <SpendVsSalesChart data={chartData} />
        </div>
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">ROAS Trend</h3>
            {connected && <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo chart</span>}
          </div>
          <p className="text-xs t3 mb-4">Blended vs Attributed · target 4.5x</p>
          <RoasChart data={chartData} target={4.5} />
        </div>
      </div>

      {/* ── Top Campaigns ───────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold t1">
              Top Campaigns
              {connected && <span className="ml-2 text-[10px] font-normal text-emerald-500 dark:text-emerald-400">· live · ranked by ROAS</span>}
            </h3>
            <p className="text-xs t3 mt-0.5">
              {connected ? `Top 5 of ${liveCampaigns.length > 0 ? rawCampaigns.length : '–'} · Click to expand Ad Sets → Ads` : 'Ranked by ROAS · Click to expand Ad Sets → Ads'}
            </p>
          </div>
          <Link to="/meta" className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-medium transition-colors">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {connected && loading && liveCampaigns.length === 0 ? (
          <div className="flex items-center gap-2 text-xs t3 py-8 justify-center">
            <Loader2 size={14} className="animate-spin" /> Loading live campaigns…
          </div>
        ) : (
          <CampaignTable
            campaigns={connected ? liveCampaigns : []}
            emptyMessage={connected ? 'No campaigns found' : 'Connect Meta to see live campaigns'}
          />
        )}
      </div>

      {/* ── Conversion rate + Top creatives ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">Conversion Rate</h3>
            {connected && <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo chart</span>}
          </div>
          <p className="text-xs t3 mb-4">Sessions → Purchase</p>
          <ConversionRateChart data={chartData} />
        </div>

        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold t1">Top Creatives</h3>
              <p className="text-xs t3 mt-0.5">By ROAS · Top 4 performers</p>
            </div>
            <Link to="/creatives" className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium transition-colors">
              All creatives <ChevronRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {mockCreatives.map((cr) => <CreativeCard key={cr.id} creative={cr} />)}
          </div>
        </div>
      </div>

      {/* ── Format breakdown ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="text-sm font-semibold t1">Spend by Creative Format</h3>
            {connected && <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">demo chart</span>}
          </div>
          <p className="text-xs t3 mb-4">Distribution + ROAS by format</p>
          <FormatBreakdownChart data={formatData} />
        </div>

        <div className="card p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold t1 mb-0.5">Channel & Market Split</h3>
            <p className="text-xs t3">Budget allocation across platforms and markets</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium t2">Meta Ads</span>
              <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400">
                {connected ? '100%' : '62%'} · {formatCurrency(connected ? spend : mockMetrics.adSpend.value * 0.62)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: connected ? '100%' : '62%' }} />
            </div>
          </div>
          {!connected && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium t2">Google Ads</span>
                <span className="text-xs font-bold text-violet-500 dark:text-violet-400">38% · {formatCurrency(mockMetrics.adSpend.value * 0.38)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: '38%' }} />
              </div>
            </div>
          )}
          <div className="border-t border-theme pt-4 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium t2">🇮🇳 India</span>
                <span className="text-xs font-bold text-orange-500">72% · {formatCurrency(mockMetrics.netSales.value * 0.72)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-orange-400 rounded-full" style={{ width: '72%' }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium t2">🌍 International</span>
                <span className="text-xs font-bold text-blue-500">28% · {formatCurrency(mockMetrics.netSales.value * 0.28)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: '28%' }} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-theme pt-4">
            {[
              { label: 'Reach', value: formatNumber(reach), icon: <Eye size={13} /> },
              { label: 'CPM',   value: formatCurrency(cpm), icon: <BarChart2 size={13} /> },
              { label: 'Intl Rev', value: formatCurrency(mockMetrics.internationalRevenue.value), icon: <Globe size={13} /> },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="flex items-center justify-center gap-1 t3 mb-1">{item.icon}<span className="text-[10px] font-semibold uppercase tracking-wide">{item.label}</span></div>
                <p className="text-sm font-bold t1">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active Alerts ────────────────────────────────────────── */}
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
