import { useState } from 'react'
import clsx from 'clsx'
import { Bell, CheckCircle } from 'lucide-react'
import { AlertCard } from '@/components/alerts/AlertCard'
import { useFilterStore } from '@/store/filterStore'
import { getAlerts } from '@/lib/mock-data'

type Filter = 'all' | 'unread' | 'critical' | 'meta' | 'google'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'critical', label: 'Critical' },
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
]

export function AlertsPage() {
  const { clientId } = useFilterStore()
  const [filter, setFilter] = useState<Filter>('all')
  const allAlerts = getAlerts(clientId)

  const filtered = allAlerts.filter((a) => {
    if (filter === 'unread') return !a.isRead
    if (filter === 'critical') return a.severity === 'critical'
    if (filter === 'meta') return a.platform === 'meta'
    if (filter === 'google') return a.platform === 'google'
    return true
  })

  const unreadCount = allAlerts.filter((a) => !a.isRead).length
  const criticalCount = allAlerts.filter((a) => a.severity === 'critical').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold t1">Alerts</h1>
          <p className="text-sm t3 mt-0.5">{unreadCount} unread · {criticalCount} critical</p>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium t2 hover:t1 bg-surface-2 hover:bg-surface-3 border border-theme rounded-lg transition-colors">
          <CheckCircle size={13} /> Mark all as read
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { label: `${unreadCount} Unread`, color: 'text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
          { label: `${criticalCount} Critical`, color: 'text-red-500 dark:text-red-400 bg-red-500/10 border-red-500/30' },
          { label: `${allAlerts.filter((a) => a.severity === 'warning').length} Warning`, color: 'text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' },
          { label: `${allAlerts.filter((a) => a.actionRequired).length} Action Required`, color: 'text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/30' },
        ].map((chip) => (
          <span key={chip.label} className={clsx('px-2.5 py-1 text-xs font-semibold rounded-lg border', chip.color)}>
            {chip.label}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-surface-2 border border-theme rounded-lg p-0.5 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              filter === f.value ? 'bg-surface-3 t1 shadow-sm' : 't3 hover:t2'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
            <Bell size={20} className="t3" />
          </div>
          <p className="text-sm font-medium t2">No alerts matching this filter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => <AlertCard key={a.id} alert={a as any} />)}
        </div>
      )}
    </div>
  )
}
