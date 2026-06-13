import clsx from 'clsx'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'indigo' | 'orange' | 'cyan'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  dot?: boolean
  className?: string
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30',
  danger:  'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30',
  info:    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30',
  purple:  'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30',
  indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-400 dark:border-indigo-500/30',
  orange:  'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30',
  cyan:    'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/30',
}

const DOT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-slate-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  info:    'bg-blue-500',
  purple:  'bg-purple-500',
  indigo:  'bg-indigo-500',
  orange:  'bg-orange-500',
  cyan:    'bg-cyan-500',
}

export function Badge({ children, variant = 'default', dot = false, className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold border', VARIANT_CLASSES[variant], className)}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', DOT_CLASSES[variant])} />}
      {children}
    </span>
  )
}

export const ActionTagBadge = ({ tag }: { tag?: string }) => {
  if (!tag) return null
  const map: Record<string, BadgeVariant> = { scale: 'success', watch: 'warning', pause: 'danger', optimise: 'info' }
  return <Badge variant={map[tag] ?? 'default'}>{tag.charAt(0).toUpperCase() + tag.slice(1)}</Badge>
}

export const CampaignTypeBadge = ({ type }: { type: string }) => {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    advantage_plus: { label: 'A+', variant: 'purple' },
    lookalike:      { label: 'LAL', variant: 'indigo' },
    retargeting:    { label: 'RTG', variant: 'orange' },
    prospecting:    { label: 'PRO', variant: 'cyan' },
    brand_awareness:{ label: 'BRAND', variant: 'info' },
  }
  const cfg = map[type] ?? { label: type, variant: 'default' as BadgeVariant }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export const MarketBadge = ({ market }: { market: string }) => {
  if (market === 'india') return <Badge variant="orange">🇮🇳 India</Badge>
  if (market === 'international') return <Badge variant="info">🌍 Intl</Badge>
  return <Badge variant="default">All</Badge>
}

export const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, BadgeVariant> = { active: 'success', paused: 'default', learning: 'warning', draft: 'info', disapproved: 'danger' }
  return <Badge variant={map[status] ?? 'default'} dot>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
}

export const FormatBadge = ({ format }: { format: string }) => {
  const map: Record<string, BadgeVariant> = { video: 'purple', reel: 'indigo', carousel: 'cyan', image: 'default', collection: 'orange' }
  return <Badge variant={map[format] ?? 'default'}>{format.charAt(0).toUpperCase() + format.slice(1)}</Badge>
}
