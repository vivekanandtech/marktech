import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Zap, Users2, LogOut, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '@/store/authStore'

// The admin's own shell — deliberately separate nav/IA from AppLayout's,
// since "manage clients, users, connections" is a fundamentally different
// task from "look at one client's ad performance." When an admin wants to
// view a specific client's dashboard, they navigate into the normal
// AppLayout/pages unchanged (see AdminClientDetailPage's "View dashboard").
export function AdminLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen bg-app overflow-hidden">
      <aside className="w-56 shrink-0 flex flex-col h-screen sticky top-0 bg-surface border-r border-theme">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-theme">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <span className="font-semibold t1 tracking-tight block leading-tight">Marktech</span>
            <span className="text-[10px] t3 uppercase tracking-widest">Admin</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavLink
            to="/admin/clients"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                isActive ? 'bg-indigo-600/15 text-indigo-500 dark:text-indigo-400 font-medium' : 't2 hover:t1 hover:bg-surface-2'
              )
            }
          >
            <Users2 size={16} />
            Clients
          </NavLink>
        </nav>

        <div className="px-3 py-3 border-t border-theme space-y-0.5">
          <button
            onClick={() => navigate('/overview')}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm t2 hover:t1 hover:bg-surface-2 transition-colors"
          >
            <ExternalLink size={16} />
            Client dashboard view
          </button>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center justify-end px-6 py-3 border-b border-theme bg-surface">
          <span className="text-xs t3">{user?.name} · {user?.email}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6 ambient-bg">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
