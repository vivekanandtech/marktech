import { create } from 'zustand'

// Data is considered fresh for 5 minutes. After that, the next visit to a
// page will trigger a background refetch while showing the stale data.
const STALE_MS = 5 * 60 * 1000

export type CacheKey = string // `${clientId}:${adAccountId}:${dateRange}`

export function makeCacheKey(clientId: string, adAccountId: string, dateRange: string): CacheKey {
  return `${clientId}:${adAccountId}:${dateRange}`
}

interface DataSlice<T> {
  data: T
  fetchedAt: number
  loading: boolean
  error: string | null
}

interface CampaignSlice extends DataSlice<any[]> {
  accountInsights: any
}

interface MetaDataStore {
  campaigns: Record<CacheKey, CampaignSlice>
  creatives: Record<CacheKey, DataSlice<any[]>>
  dailyInsights: Record<CacheKey, DataSlice<any[]>>

  setCampaigns:     (key: CacheKey, patch: Partial<CampaignSlice>) => void
  setCreatives:     (key: CacheKey, patch: Partial<DataSlice<any[]>>) => void
  setDailyInsights: (key: CacheKey, patch: Partial<DataSlice<any[]>>) => void

  // Returns true when cached data exists and is younger than STALE_MS
  isFresh: (type: 'campaigns' | 'creatives' | 'dailyInsights', key: CacheKey) => boolean

  // Force a refetch on next access (e.g. Refresh button)
  invalidate: (type: 'campaigns' | 'creatives' | 'dailyInsights', key: CacheKey) => void
}

const emptySlice = <T>(empty: T): DataSlice<T> => ({
  data: empty, fetchedAt: 0, loading: false, error: null,
})

export const useMetaDataStore = create<MetaDataStore>((set, get) => ({
  campaigns:    {},
  creatives:    {},
  dailyInsights: {},

  setCampaigns: (key, patch) =>
    set((s) => ({ campaigns: { ...s.campaigns, [key]: { ...s.campaigns[key], ...patch } } })),

  setCreatives: (key, patch) =>
    set((s) => ({ creatives: { ...s.creatives, [key]: { ...s.creatives[key], ...patch } } })),

  setDailyInsights: (key, patch) =>
    set((s) => ({ dailyInsights: { ...s.dailyInsights, [key]: { ...s.dailyInsights[key], ...patch } } })),

  isFresh: (type, key) => {
    const entry = get()[type][key]
    return !!entry && !entry.loading && !entry.error &&
      entry.fetchedAt > 0 && Date.now() - entry.fetchedAt < STALE_MS
  },

  invalidate: (type, key) => {
    if (type === 'campaigns')
      set((s) => ({ campaigns: { ...s.campaigns, [key]: { ...s.campaigns[key], fetchedAt: 0 } } }))
    else if (type === 'creatives')
      set((s) => ({ creatives: { ...s.creatives, [key]: { ...s.creatives[key], fetchedAt: 0 } } }))
    else
      set((s) => ({ dailyInsights: { ...s.dailyInsights, [key]: { ...s.dailyInsights[key], fetchedAt: 0 } } }))
  },
}))
