import { useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, ListChecks } from 'lucide-react'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useActionablesStore } from '@/store/actionablesStore'
import { ActionableCard } from '@/components/actionables/ActionableCard'

type Filter = 'open' | 'critical' | 'warning' | 'meta' | 'google' | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' },
  { value: 'all', label: 'All' },
]

// Alerts are the critical/warning subset of Actionables — one engine, so an
// alert and its recommended fix can never disagree.
export function AlertsPage() {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const payload = useActionablesStore((s) => s.payload)
  const [filter, setFilter] = useState<Filter>('open')
  const metaAdAccountId = clients.find((c) => c.id === clientId)?.metaAdAccountId ?? null

  const alerts = (payload?.items ?? []).filter((i) => i.severity === 'critical' || i.severity === 'warning')
  const filtered = alerts.filter((a) => {
    if (filter === 'open') return a.status === 'new'
    if (filter === 'critical') return a.severity === 'critical'
    if (filter === 'warning') return a.severity === 'warning'
    if (filter === 'meta') return a.platform === 'meta' || a.platform === 'cross'
    if (filter === 'google') return a.platform === 'google'
    return true
  })
  const openCount = alerts.filter((a) => a.status === 'new').length
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && a.status === 'new').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold t1">Alerts</h1>
          <p className="text-sm t3 mt-0.5">
            {payload ? `${openCount} open · ${criticalCount} critical` : 'No analysis yet'} · from the latest Actionables run
          </p>
        </div>
        <Link to="/actionables" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium t2 hover:t1 bg-surface-2 hover:bg-surface-3 border border-theme rounded-lg transition-colors">
          <ListChecks size={13} /> All actionables
        </Link>
      </div>

      <div className="flex items-center gap-1 bg-surface-2 border border-theme rounded-lg p-0.5 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={clsx('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', filter === f.value ? 'bg-surface-3 t1 shadow-sm' : 't3 hover:t2')}
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
          <p className="text-sm font-medium t2">{payload ? 'No alerts matching this filter' : 'Generate Actionables to see alerts for this account'}</p>
          {!payload && <Link to="/actionables" className="text-xs text-indigo-500 hover:underline mt-1">Go to Actionables →</Link>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a, i) => (
            <ActionableCard key={a.id} a={a} index={i + 1} clientId={clientId} metaAdAccountId={metaAdAccountId} defaultOpen />
          ))}
        </div>
      )}
    </div>
  )
}
