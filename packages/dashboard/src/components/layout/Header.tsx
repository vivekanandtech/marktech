import { Bell, ChevronDown, Globe, MapPin, Sun, Moon, Monitor } from 'lucide-react'
import clsx from 'clsx'
import { useState, useRef, useEffect } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore, type ThemeMode } from '@/store/themeStore'
import { CLIENTS, getAlerts } from '@/lib/mock-data'

const DATE_RANGES = ['1D', '3D', '7D', '14D', '30D', '3M', '6M', '1Y'] as const
type DateRange = typeof DATE_RANGES[number]
type Market = 'all' | 'india' | 'international'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun size={14} /> },
  { value: 'dark',  label: 'Dark',  icon: <Moon size={14} /> },
  { value: 'auto',  label: 'Auto',  icon: <Monitor size={14} /> },
]

function ThemeToggle() {
  const { mode, setMode } = useThemeStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = THEME_OPTIONS.find((o) => o.value === mode) ?? THEME_OPTIONS[1]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm t2 hover:t1 hover:bg-surface-2 transition-colors border border-theme"
        title="Toggle theme"
      >
        {current.icon}
        <span className="hidden sm:inline text-xs font-medium">{current.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-theme rounded-xl shadow-xl py-1 z-50">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setMode(opt.value); setOpen(false) }}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
                mode === opt.value
                  ? 'text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 font-semibold'
                  : 't2 hover:t1 hover:bg-surface-2'
              )}
            >
              {opt.icon} {opt.label}
              {mode === opt.value && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Header() {
  const { clientId, setClientId, dateRange, setDateRange, market, setMarket } = useFilterStore()
  const user = useAuthStore((s) => s.user)
  const alerts = getAlerts(clientId)
  const unreadCount = alerts.filter((a) => !a.isRead).length
  const [clientOpen, setClientOpen] = useState(false)
  const clientRef = useRef<HTMLDivElement>(null)
  const currentClient = CLIENTS.find((c) => c.id === clientId) ?? CLIENTS[0]

  // Close client dropdown when clicking outside
  useEffect(() => {
    if (!clientOpen) return
    const handler = (e: MouseEvent) => {
      if (!clientRef.current?.contains(e.target as Node)) setClientOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [clientOpen])

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-5 py-2.5 bg-surface border-b border-theme backdrop-blur transition-colors">
      {/* Client switcher */}
      <div className="relative" ref={clientRef}>
        <button
          onClick={() => setClientOpen(!clientOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors text-sm font-medium t1 border border-theme"
        >
          <span
            className="flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold text-white shrink-0"
            style={{ backgroundColor: currentClient.logoColor }}
          >
            {currentClient.logoInitials}
          </span>
          <span className="max-w-[110px] truncate">{currentClient.name}</span>
          <ChevronDown size={13} className={clsx('t3 shrink-0 transition-transform', clientOpen && 'rotate-180')} />
        </button>

        {clientOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-56 bg-surface border border-theme rounded-xl shadow-2xl py-1 z-50">
            {CLIENTS.map((c) => (
              <button
                key={c.id}
                onClick={() => { setClientId(c.id); setClientOpen(false) }}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                  c.id === clientId ? 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400' : 't2 hover:t1 hover:bg-surface-2'
                )}
              >
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: c.logoColor }}
                >
                  {c.logoInitials}
                </span>
                <div>
                  <p className="font-medium leading-tight">{c.name}</p>
                  <p className="text-xs t3">{c.industry}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-surface-3" />

      {/* Date range */}
      <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 border border-theme">
        {DATE_RANGES.map((range) => (
          <button
            key={range}
            onClick={() => setDateRange(range as DateRange)}
            className={clsx(
              'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
              dateRange === range ? 'bg-indigo-600 text-white shadow-sm' : 't2 hover:t1'
            )}
          >
            {range}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-surface-3" />

      {/* Market filter */}
      <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 border border-theme">
        {([
          { label: 'All', value: 'all', icon: null },
          { label: 'India', value: 'india', icon: <MapPin size={10} /> },
          { label: 'Intl', value: 'international', icon: <Globe size={10} /> },
        ] as { label: string; value: Market; icon: React.ReactNode }[]).map((m) => (
          <button
            key={m.value}
            onClick={() => setMarket(m.value)}
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
              market === m.value ? 'bg-violet-600 text-white shadow-sm' : 't2 hover:t1'
            )}
          >
            {m.icon}{m.label}
          </button>
        ))}
      </div>

      {/* Right */}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />

        <button className="relative p-2 t2 hover:t1 transition-colors rounded-lg hover:bg-surface-2">
          <Bell size={17} />
          {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />}
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white">
            {user?.name?.charAt(0) ?? 'A'}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium t1 leading-tight">{user?.name ?? 'Admin'}</p>
            <p className="text-[10px] t3 capitalize">{(user?.role ?? 'agency_admin').replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
