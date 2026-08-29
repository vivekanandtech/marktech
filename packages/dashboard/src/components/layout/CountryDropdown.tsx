import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Globe } from 'lucide-react'
import clsx from 'clsx'
import { useFilterStore } from '@/store/filterStore'
import { apiFetch } from '@/lib/api'

export function CountryDropdown() {
  const { clientId, country, setCountry } = useFilterStore()
  const [countries, setCountries] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!clientId) return
    apiFetch(`/api/shopify/countries?clientId=${clientId}`)
      .then((r) => r.json())
      .then((json) => setCountries(Array.isArray(json.countries) ? json.countries : []))
      .catch(() => setCountries([]))
  }, [clientId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Reset to "all" if the persisted country no longer exists for this client
  // (e.g. switched to a client whose store doesn't ship there).
  useEffect(() => {
    if (country !== 'all' && countries.length > 0 && !countries.includes(country)) setCountry('all')
  }, [countries, country, setCountry])

  const label = country === 'all' ? 'All countries' : country

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium t2 hover:t1 hover:bg-surface-2 transition-colors border border-theme"
      >
        <Globe size={12} />
        <span className="max-w-[110px] truncate">{label}</span>
        <ChevronDown size={12} className={clsx('t3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 max-h-72 overflow-y-auto bg-surface border border-theme rounded-xl shadow-2xl py-1 z-50">
          <button
            onClick={() => { setCountry('all'); setOpen(false) }}
            className={clsx(
              'w-full flex items-center px-3 py-2 text-xs text-left transition-colors',
              country === 'all' ? 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 font-semibold' : 't2 hover:t1 hover:bg-surface-2'
            )}
          >
            All countries
          </button>
          {countries.length === 0 ? (
            <p className="px-3 py-2 text-xs t3">Connect Shopify to filter by country</p>
          ) : (
            countries.map((c) => (
              <button
                key={c}
                onClick={() => { setCountry(c); setOpen(false) }}
                className={clsx(
                  'w-full flex items-center px-3 py-2 text-xs text-left transition-colors truncate',
                  country === c ? 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 font-semibold' : 't2 hover:t1 hover:bg-surface-2'
                )}
              >
                {c}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
