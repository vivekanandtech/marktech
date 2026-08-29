import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type DateRange = '1D' | '3D' | '7D' | '14D' | '30D' | '3M' | '6M' | '1Y'

interface FilterState {
  clientId: string
  dateRange: DateRange
  country: string // real country name (e.g. "India"), or 'all'
  setClientId: (id: string) => void
  setDateRange: (range: DateRange) => void
  setCountry: (country: string) => void
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      clientId: '',
      dateRange: '30D',
      country: 'all',
      setClientId: (clientId) => set({ clientId }),
      setDateRange: (dateRange) => set({ dateRange }),
      setCountry: (country) => set({ country }),
    }),
    { name: 'marktech-filters', partialize: (s) => ({ clientId: s.clientId, dateRange: s.dateRange }) }
  )
)
