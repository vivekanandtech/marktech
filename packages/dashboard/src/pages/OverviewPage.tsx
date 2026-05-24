import {
  DollarSign, ShoppingCart, TrendingUp,
  Globe, BarChart2,
  Eye, ChevronRight, ArrowRight,
} from 'lucide-react'
import clsx from 'clsx'
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
import {
  getSummaryMetrics, getChartData, getFormatBreakdown,
  getCreatives, getAlerts, getCampaigns,
} from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'

export function OverviewPage() {
  const { clientId, dateRange, market } = useFilterStore()
  const metrics    = getSummaryMetrics(clientId, market)
  const chartData  = getChartData(clientId, dateRange, market)
  const formatData = getFormatBreakdown(clientId)
  const creatives  = getCreatives(clientId).slice(0, 4)
  const alerts     = getAlerts(clientId).filter((a) => !a.isRead)
  const topCampaigns = getCampaigns(clientId, 'all', market)
    .sort((a: any, b: any) => b.roas - a.roas)
    .slice(0, 5)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold t1">Overview</h1>
          <p className="text-sm t3 mt-0.5">All channels · All campaigns</p>
        </div>
        <span className="text-[11px] t3 font-medium bg-surface-2 border border-theme px-2.5 py-1 rounded-lg">{dateRange} window</span>
      </div>

      {/* ── Hero KPIs ───────────────────────────────────────────── */}
      {/* Blended ROAS is the star — wider, highlighted gradient */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* ROAS hero — col-span-2 on mobile, col-span-2 on desktop */}
        <div className="col-span-2 lg:col-span-2">
          <div className="relative flex flex-col gap-2.5 rounded-xl border p-4 transition-all h-full bg-gradient-to-br from-indigo-600/15 to-violet-600/10 border-indigo-500/40 dark:border-indigo-500/30 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider t3">Blended ROAS</span>
              <TrendingUp size={15} className="t3" />
            </div>
            <div>
              <p className="text-4xl font-bold tracking-tight text-gradient">{formatRoas(metrics.blendedRoas.value)}</p>
              <p className="text-xs t3 mt-0.5">across Meta + Google</p>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendBadge change={metrics.blendedRoas.change} improving={metrics.blendedRoas.improving} />
              <span className="text-[11px] t3">vs prev period</span>
            </div>
          </div>
        </div>

        <MetricCard label="Ad Spend"      value={formatCurrency(metrics.adSpend.value)}     change={metrics.adSpend.change}     improving={metrics.adSpend.improving}     icon={<DollarSign size={15} />} />
        <MetricCard label="Net Sales"     value={formatCurrency(metrics.netSales.value)}     change={metrics.netSales.change}    improving={metrics.netSales.improving}    icon={<ShoppingCart size={15} />} />
        <MetricCard label="Orders"        value={formatNumber(metrics.orders.value)}          change={metrics.orders.change}      improving={metrics.orders.improving}      icon={<ShoppingCart size={15} />} />
      </div>

      {/* ── Secondary metrics strip ─────────────────────────────── */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        <MetricCard size="sm" label="Attrib. ROAS" value={formatRoas(metrics.attributedRoas.value)}           change={metrics.attributedRoas.change}   improving={metrics.attributedRoas.improving} />
        <MetricCard size="sm" label="CAC"           value={formatCurrency(metrics.cac.value)}                  change={metrics.cac.change}              improving={metrics.cac.improving} />
        <MetricCard size="sm" label="AoV"           value={formatCurrency(metrics.aov.value)}                  change={metrics.aov.change}              improving={metrics.aov.improving} />
        <MetricCard size="sm" label="CTR"           value={formatPercent(metrics.ctr.value)}                   change={metrics.ctr.change}              improving={metrics.ctr.improving} />
        <MetricCard size="sm" label="CPA"           value={formatCurrency(metrics.cpa.value)}                  change={metrics.cpa.change}              improving={metrics.cpa.improving} />
        <MetricCard size="sm" label="Sessions"      value={formatNumber(metrics.sessions.value)}               change={metrics.sessions.change}         improving={metrics.sessions.improving} />
        <MetricCard size="sm" label="CM Ratio"      value={formatPercent(metrics.cmRatio.value)}               change={metrics.cmRatio.change}          improving={metrics.cmRatio.improving} />
        <MetricCard size="sm" label="New Cust %"    value={formatPercent(metrics.newCustomerRate.value)}       change={metrics.newCustomerRate.change}  improving={metrics.newCustomerRate.improving} />
      </div>

      {/* ── Main charts ─────────────────────────────────────────── */}
      {/* Spend vs Sales gets more width — it carries more data story */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3">
          <h3 className="text-sm font-semibold t1 mb-0.5">Ad Spend vs Net Sales</h3>
          <p className="text-xs t3 mb-4">Meta + Google spend stacked · Net sales line</p>
          <SpendVsSalesChart data={chartData} />
        </div>
        <div className="card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold t1 mb-0.5">ROAS Trend</h3>
          <p className="text-xs t3 mb-4">Blended vs Attributed · target 4.5x</p>
          <RoasChart data={chartData} target={4.5} />
        </div>
      </div>

      {/* ── Top Campaigns — full drilldown ─────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold t1">Top Campaigns</h3>
            <p className="text-xs t3 mt-0.5">Ranked by ROAS · Click to expand Ad Sets → Ads</p>
          </div>
          <Link
            to="/meta"
            className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-medium transition-colors"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <CampaignTable campaigns={topCampaigns} emptyMessage="No campaigns for this market filter" />
      </div>

      {/* ── Conversion rate + Top creatives ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold t1 mb-0.5">Conversion Rate</h3>
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
            {creatives.map((cr) => <CreativeCard key={cr.id} creative={cr} />)}
          </div>
        </div>
      </div>

      {/* ── Format breakdown ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold t1 mb-0.5">Spend by Creative Format</h3>
          <p className="text-xs t3 mb-4">Distribution + ROAS by format</p>
          <FormatBreakdownChart data={formatData} />
        </div>

        {/* Quick stats panel */}
        <div className="card p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold t1 mb-0.5">Channel & Market Split</h3>
            <p className="text-xs t3">Budget allocation across platforms and markets</p>
          </div>

          {/* Platform split */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium t2">Meta Ads</span>
              <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400">62% · {formatCurrency(metrics.adSpend.value * 0.62)}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: '62%' }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium t2">Google Ads</span>
              <span className="text-xs font-bold text-violet-500 dark:text-violet-400">38% · {formatCurrency(metrics.adSpend.value * 0.38)}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: '38%' }} />
            </div>
          </div>

          <div className="border-t border-theme pt-4 space-y-3">
            {/* Market split */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium t2">🇮🇳 India</span>
                <span className="text-xs font-bold text-orange-500">72% · {formatCurrency(metrics.netSales.value * 0.72)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-orange-400 rounded-full" style={{ width: '72%' }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium t2">🌍 International</span>
                <span className="text-xs font-bold text-blue-500">28% · {formatCurrency(metrics.netSales.value * 0.28)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: '28%' }} />
              </div>
            </div>
          </div>

          {/* Quick KPIs */}
          <div className="grid grid-cols-3 gap-3 border-t border-theme pt-4">
            {[
              { label: 'Reach', value: formatNumber(metrics.reach.value), icon: <Eye size={13} /> },
              { label: 'CPM', value: formatCurrency(metrics.cpm.value, false), icon: <BarChart2 size={13} /> },
              { label: 'Intl Rev', value: formatCurrency(metrics.internationalRevenue.value), icon: <Globe size={13} /> },
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
