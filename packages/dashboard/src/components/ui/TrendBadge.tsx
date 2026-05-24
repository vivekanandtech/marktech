import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

interface TrendBadgeProps {
  change: number
  improving: boolean
  size?: 'sm' | 'md'
}

export function TrendBadge({ change, improving, size = 'sm' }: TrendBadgeProps) {
  const isFlat = Math.abs(change) < 0.1
  const positive = improving
  const sign = change > 0 ? '+' : ''
  const iconSize = size === 'sm' ? 11 : 13

  if (isFlat) {
    return (
      <span className={clsx('inline-flex items-center gap-1 font-medium text-slate-400', size === 'sm' ? 'text-xs' : 'text-sm')}>
        <Minus size={iconSize} />
        {sign}{change.toFixed(1)}%
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-medium',
        size === 'sm' ? 'text-xs' : 'text-sm',
        positive ? 'text-emerald-400' : 'text-red-400'
      )}
    >
      {positive ? <TrendingUp size={iconSize} /> : <TrendingDown size={iconSize} />}
      {sign}{change.toFixed(1)}%
    </span>
  )
}
