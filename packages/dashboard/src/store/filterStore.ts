import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type DateRange = '1D' | '3D' | '7D' | '14D' | '30D' | '3M' | '6M' | '1Y'
type Market = 'all' | 'india' | 'international'

interface FilterState {
  clientId: string
  dateRange: DateRange
  market: Market
  setClientId: (id: string) => void
  setDateRange: (range: DateRange) => void
  setMarket: (market: Market) => void
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      clientId: '',
      dateRange: '30D',
      market: 'all',
      setClientId: (clientId) => set({ clientId }),
      setDateRange: (dateRange) => set({ dateRange }),
      setMarket: (market) => set({ market }),
    }),
    { name: 'marktech-filters', partialize: (s) => ({ clientId: s.clientId, dateRange: s.dateRange }) }
  )
)
