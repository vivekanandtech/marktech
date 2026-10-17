import clsx from 'clsx'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { FunnelHoverCard } from '@/components/ui/FunnelHoverCard'
import { MetricTrend, isMetricImproving, MetaFunnelCounts } from '@/lib/meta-transform'

export interface RowMetrics {
  spend: number
  roas: number
  ctr: number
  cpa: number
  conversions: number
  results?: number
  resultLabel?: string
  costPerResult?: number
  trend: MetricTrend | null
  funnel?: MetaFunnelCounts
}

type Level = 'campaign' | 'adset' | 'ad'

const CELL: Record<Level, { td: string; value: string; trendSize: 'sm' | 'md' }> = {
  campaign: { td: 'px-3 py-3 text-right', value: 'text-sm', trendSize: 'sm' },
  adset:    { td: 'px-3 py-2.5 text-right', value: 'text-xs', trendSize: 'sm' },
  ad:       { td: 'px-3 py-2 text-right', value: 'text-[11px]', trendSize: 'sm' },
}

function roasColor(roas: number) {
  if (roas <= 0) return 't3'
  if (roas >= 4.5) return 'text-emerald-600 dark:text-emerald-400'
  if (roas >= 3.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function Trend({ pct, metric }: { pct: number | null | undefined; metric: Parameters<typeof isMetricImproving>[0] }) {
  if (pct == null) return null
  return <div><TrendBadge change={pct} improving={isMetricImproving(metric, pct)} size="sm" /></div>
}

// Spend · Results · ROAS · CTR · Cost/Result — shared by campaign, ad set and
// ad rows so all three levels always show the same columns the same way.
export function MetricCells({ m, level, showFunnel, isGoogle }: { m: RowMetrics; level: Level; showFunnel: boolean; isGoogle: boolean }) {
  const c = CELL[level]
  const strong = level === 'campaign' ? 'font-semibold t1' : level === 'adset' ? 'font-medium t2' : 'font-medium t3'
  const results = m.results ?? m.conversions
  const costPerResult = m.costPerResult ?? m.cpa

  return (
    <>
      <td className={c.td}>
        <p className={clsx(c.value, strong)}>{formatCurrency(m.spend)}</p>
        <Trend pct={m.trend?.spendPct} metric="spend" />
      </td>

      <td className={c.td}>
        <FunnelHoverCard funnel={m.funnel}>
          <p className={clsx(c.value, strong, m.funnel && 'underline decoration-dotted underline-offset-2')}>
            {results > 0 ? formatNumber(Math.round(results * 10) / 10) : '–'}
          </p>
          {results > 0 && <p className="text-[10px] t3">{m.resultLabel ?? 'Purchases'}</p>}
        </FunnelHoverCard>
        <Trend pct={results > 0 ? m.trend?.resultsPct : null} metric="results" />
      </td>

      <td className={c.td}>
        <p className={clsx(c.value, 'font-bold', roasColor(m.roas))}>{formatRoas(m.roas)}</p>
        <Trend pct={m.roas > 0 ? m.trend?.roasPct : null} metric="roas" />
      </td>

      <td className={clsx(c.td, c.value, 't2')}>
        {formatPercent(m.ctr)}
        <Trend pct={m.trend?.ctrPct} metric="ctr" />
      </td>

      <td className={clsx(c.td, c.value, 't2')}>
        {costPerResult > 0 ? formatCurrency(costPerResult) : '–'}
        <Trend pct={costPerResult > 0 ? (m.trend?.cprPct ?? m.trend?.cpaPct) : null} metric="cpa" />
      </td>

      {showFunnel && (
        isGoogle ? (
          <>
            <td className={clsx(c.td, c.value, 't3')}>–</td>
            <td className={clsx(c.td, c.value, 't3')}>–</td>
            <td className={clsx(c.td, c.value, 't3')}>–</td>
          </>
        ) : (
          <>
            <td className={clsx(c.td, c.value, 't2')}>{formatNumber(m.funnel?.addToCart ?? 0)}</td>
            <td className={clsx(c.td, c.value, 't2')}>{formatNumber(m.funnel?.initiateCheckout ?? 0)}</td>
            <td className={clsx(c.td, c.value, 't2')}>{formatNumber(m.funnel?.addPaymentInfo ?? 0)}</td>
          </>
        )
      )}
    </>
  )
}

export const METRIC_COLUMN_COUNT = 6
