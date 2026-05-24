import { create } from 'zustand'

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

export const useFilterStore = create<FilterState>((set) => ({
  clientId: 'c1',
  dateRange: '30D',
  market: 'all',
  setClientId: (clientId) => set({ clientId }),
  setDateRange: (dateRange) => set({ dateRange }),
  setMarket: (market) => set({ market }),
}))
