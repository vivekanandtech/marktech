import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, Target, Image, Bell, Settings,
  ChevronRight, Zap,
} from 'lucide-react'
import clsx from 'clsx'
import { useFilterStore } from '@/store/filterStore'
import { getAlerts } from '@/lib/mock-data'

interface NavItem { label: string; to: string; icon: React.ReactNode }
interface NavGroup { heading?: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { items: [{ label: 'Overview', to: '/overview', icon: <LayoutDashboard size={16} /> }] },
  {
    heading: 'Meta Ads',
    items: [
      { label: 'Performance', to: '/meta', icon: <TrendingUp size={16} /> },
      { label: 'Creatives', to: '/creatives', icon: <Image size={16} /> },
    ],
  },
  {
    heading: 'Google Ads',
    items: [{ label: 'Performance', to: '/google', icon: <Target size={16} /> }],
  },
]

export function Sidebar() {
  const clientId = useFilterStore((s) => s.clientId)
  const unreadCount = getAlerts(clientId).filter((a) => !a.isRead).length

  return (
    <aside className="w-56 shrink-0 flex flex-col h-screen sticky top-0 bg-surface border-r border-theme transition-colors">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-theme">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
          <Zap size={14} className="text-white" />
        </div>
        <span className="font-semibold t1 tracking-tight">Marktech</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.heading && (
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest t3">
                {group.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-indigo-600/15 text-indigo-500 dark:text-indigo-400 font-medium'
                          : 't2 hover:t1 hover:bg-surface-2'
                      )
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <ul className="space-y-0.5">
          <li>
            <NavLink
              to="/alerts"
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                  isActive ? 'bg-indigo-600/15 text-indigo-500 dark:text-indigo-400 font-medium' : 't2 hover:t1 hover:bg-surface-2'
                )
              }
            >
              <Bell size={16} />
              Alerts
              {unreadCount > 0 && (
                <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
                  {unreadCount}
                </span>
              )}
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                  isActive ? 'bg-indigo-600/15 text-indigo-500 dark:text-indigo-400 font-medium' : 't2 hover:t1 hover:bg-surface-2'
                )
              }
            >
              <Settings size={16} />
              Settings
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* API status */}
      <div className="px-4 py-3 border-t border-theme">
        <div className="flex items-center gap-2 text-xs t3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Mock data mode
          <ChevronRight size={10} className="ml-auto" />
        </div>
      </div>
    </aside>
  )
}
