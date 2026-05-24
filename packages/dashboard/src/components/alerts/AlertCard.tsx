import { AlertTriangle, Info, XCircle, TrendingDown, Zap, Clock, CheckCircle } from 'lucide-react'
import clsx from 'clsx'
import { formatRoas } from '@/lib/formatters'

interface Alert {
  id: string; platform: string; type: string; severity: string
  campaignName?: string; title: string; message: string
  metric?: string; metricValue?: number; threshold?: number
  createdAt: string; isRead: boolean; actionRequired: boolean
}

const SEVERITY_CONFIG = {
  critical: { icon: XCircle, color: 'text-red-500 dark:text-red-400', bg: 'bg-red-500/8 border-red-500/25 dark:bg-red-500/10 dark:border-red-500/30', iconBg: 'bg-red-500/15 dark:bg-red-500/20' },
  warning:  { icon: AlertTriangle, color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500/8 border-amber-500/25 dark:bg-amber-500/10 dark:border-amber-500/30', iconBg: 'bg-amber-500/15 dark:bg-amber-500/20' },
  info:     { icon: Info, color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/8 border-blue-500/25 dark:bg-blue-500/10 dark:border-blue-500/30', iconBg: 'bg-blue-500/15 dark:bg-blue-500/20' },
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  creative_fatigue: <Zap size={12} />,
  roas_drop:        <TrendingDown size={12} />,
  high_performer:   <Zap size={12} />,
  budget_cap:       <Clock size={12} />,
  learning_phase:   <CheckCircle size={12} />,
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function AlertCard({ alert }: { alert: Alert }) {
  const cfg = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info
  const Icon = cfg.icon

  return (
    <div className={clsx('flex gap-3 p-4 rounded-xl border transition-all', cfg.bg, !alert.isRead && 'ring-1 ring-inset ring-current/10')}>
      <div className={clsx('flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5', cfg.iconBg)}>
        <Icon size={16} className={cfg.color} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <p className={clsx('text-sm font-semibold', cfg.color)}>{alert.title}</p>
            {!alert.isRead && <span className="w-1.5 h-1.5 bg-current rounded-full shrink-0" />}
          </div>
          <span className="text-[11px] t3 shrink-0">{timeAgo(alert.createdAt)}</span>
        </div>

        {alert.campaignName && (
          <p className="text-xs t3 mb-1.5">
            <span className={clsx('inline-flex items-center gap-1 font-medium', alert.platform === 'meta' ? 'text-blue-500 dark:text-blue-400/80' : 'text-emerald-600 dark:text-emerald-400/80')}>
              {alert.platform === 'meta' ? 'Meta' : 'Google'} · {TYPE_ICONS[alert.type]}
            </span>{' '}
            {alert.campaignName}
          </p>
        )}

        <p className="text-xs t2 leading-relaxed">{alert.message}</p>

        {alert.metricValue !== undefined && alert.threshold !== undefined && (
          <div className="mt-2 flex items-center gap-3 text-[11px]">
            <span className="t3">
              {alert.metric?.toUpperCase()}: <span className={cfg.color + ' font-bold'}>
                {alert.metric === 'roas' ? formatRoas(alert.metricValue) : alert.metric === 'frequency' ? alert.metricValue.toFixed(1) : alert.metricValue}
              </span>
            </span>
            <span className="t3 opacity-60">Target: {alert.metric === 'roas' ? formatRoas(alert.threshold) : alert.metric === 'frequency' ? `≤ ${alert.threshold}` : alert.threshold}</span>
          </div>
        )}

        {alert.actionRequired && (
          <div className="mt-2.5 flex gap-2">
            <button className={clsx('px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors', cfg.color, 'bg-current/10 hover:bg-current/20')}>
              Take Action
            </button>
            <button className="px-3 py-1 text-[11px] font-medium rounded-lg t3 hover:t1 hover:bg-surface-2 transition-colors">
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
