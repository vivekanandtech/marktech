import { Link } from 'react-router-dom'
import { ArrowRight, ListChecks } from 'lucide-react'
import clsx from 'clsx'
import { useActionablesStore, actionableTitle, severityTextClass } from '@/store/actionablesStore'
import { CATEGORY_CONFIG } from './ActionableCard'

export function ActionablesTeaser() {
  const payload = useActionablesStore((s) => s.payload)
  const open = (payload?.items ?? []).filter((i) => i.status === 'new')
  const top = open.slice(0, 4)

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold t1 flex items-center gap-1.5">
            <ListChecks size={14} className="text-indigo-500" /> Top Actionables
          </h3>
          <p className="text-xs t3 mt-0.5">
            {payload ? `${open.length} open · generated ${new Date(payload.generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} for ${payload.dateRange}` : 'Not generated yet for this client'}
          </p>
        </div>
        <Link to="/actionables" className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 font-medium transition-colors">
          {payload ? 'View all' : 'Generate'} <ArrowRight size={12} />
        </Link>
      </div>
      {top.length === 0 ? (
        <p className="text-xs t3 py-3">{payload ? 'Nothing open — all caught up.' : 'Generate actionables to see what to change next.'}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {top.map((a, i) => {
            const Icon = (CATEGORY_CONFIG[a.category] ?? CATEGORY_CONFIG.fix).icon
            return (
              <li key={a.id}>
                <Link to="/actionables" className="flex items-start gap-2.5 py-2 group">
                  <span className="text-[11px] font-bold t3 w-4 shrink-0 mt-0.5">{i + 1}</span>
                  <Icon size={13} className={clsx('shrink-0 mt-0.5', severityTextClass(a.severity))} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold t1 group-hover:text-indigo-500 truncate">{actionableTitle(a)}</p>
                    <p className="text-[11px] t3 line-clamp-1">{a.detail}</p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
