import clsx from 'clsx'
import { MetricInfoTooltip } from '@/components/ui/MetricInfoTooltip'
import { ReconciliationChart } from '@/components/charts/ReconciliationChart'
import { useReconciliationTrend } from '@/hooks/useReconciliationTrend'
import { getMetricStatus, STATUS_DOT_CLASS } from '@/lib/metric-thresholds'
import { formatCurrency } from '@/lib/formatters'
import type { OverviewMetricsResponse } from '@/store/metricsDataStore'

function ChannelClaimCard({
  label, claimed, truth, overClaim, metricId,
}: { label: string; claimed: number; truth: number; overClaim: number; metricId: string }) {
  const status = getMetricStatus('overClaimMultiplier', overClaim)
  return (
    <div className="rounded-xl border border-theme p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold t1">
          {status && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT_CLASS[status])} />}
          {label}
        </span>
        <MetricInfoTooltip metricId={metricId} size="sm" />
      </div>
      <p className="text-xl font-bold t1">{overClaim > 0 ? `${overClaim.toFixed(2)}x` : '–'}</p>
      <p className="text-[11px] t3 leading-relaxed">
        Claims {formatCurrency(claimed)} · Shopify confirms {formatCurrency(truth)} from {label}
      </p>
    </div>
  )
}

function EmptyChannelCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-theme p-3.5 flex flex-col items-center justify-center gap-1 text-center min-h-[104px]">
      <span className="text-xs font-semibold t3">{label}</span>
      <p className="text-[11px] t3">Not connected</p>
    </div>
  )
}

export function ReconciliationSection({ overview }: { overview: OverviewMetricsResponse | null }) {
  const { data: trend } = useReconciliationTrend()
  const current = overview?.current

  if (!overview || !overview.connected.shopify) return null

  return (
    <div className="card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold t1 mb-0.5">Reconciliation</h3>
        <p className="text-xs t3">What each platform claims it drove, vs. what Shopify confirms actually came from that channel</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {overview.connected.meta ? (
          <ChannelClaimCard
            label="Meta"
            claimed={current?.metaReportedRevenue ?? 0}
            truth={current?.metaChannelNetRevenue ?? 0}
            overClaim={current?.metaOverClaimMultiplier ?? 0}
            metricId="metaOverClaimMultiplier"
          />
        ) : <EmptyChannelCard label="Meta" />}

        {overview.connected.google ? (
          <ChannelClaimCard
            label="Google"
            claimed={current?.googleReportedRevenue ?? 0}
            truth={current?.googleChannelNetRevenue ?? 0}
            overClaim={current?.googleOverClaimMultiplier ?? 0}
            metricId="googleOverClaimMultiplier"
          />
        ) : <EmptyChannelCard label="Google" />}
      </div>

      {trend && trend.days.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold t3 uppercase tracking-wider mb-2">Blended trend</p>
          <ReconciliationChart data={trend.days} />
        </div>
      )}
    </div>
  )
}
