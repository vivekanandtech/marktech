import clsx from 'clsx'
import { TrendBadge } from './TrendBadge'
import { useFilterStore } from '@/store/filterStore'

interface MetricCardProps {
  label: string
  value: string
  change: number
  improving: boolean
  icon?: React.ReactNode
  subtitle?: string
  highlight?: boolean
  size?: 'md' | 'sm'
  className?: string
}

export function MetricCard({
  label, value, change, improving, icon, subtitle, highlight = false, size = 'md', className,
}: MetricCardProps) {
  const dateRange = useFilterStore((s) => s.dateRange)

  if (size === 'sm') {
    return (
      <div className={clsx('card px-3 py-2.5 flex flex-col gap-1 card-hover', className)}>
        <span className="text-[10px] font-semibold uppercase tracking-wider t3">{label}</span>
        <p className="text-base font-bold t1">{value}</p>
        <TrendBadge change={change} improving={improving} />
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'relative flex flex-col gap-2.5 rounded-xl border p-4 transition-all',
        highlight
          ? 'bg-gradient-to-br from-indigo-600/15 to-violet-600/10 border-indigo-500/40 dark:border-indigo-500/30 shadow-sm'
          : 'card card-hover',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider t3">{label}</span>
        {icon && <span className="t3">{icon}</span>}
      </div>

      <div>
        <p className={clsx(
          'text-2xl font-bold tracking-tight',
          highlight ? 'text-gradient' : 't1'
        )}>
          {value}
        </p>
        {subtitle && <p className="text-xs t3 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-1.5">
        <TrendBadge change={change} improving={improving} />
        <span className="text-[11px] t3">vs prev {dateRange}</span>
      </div>
    </div>
  )
}
