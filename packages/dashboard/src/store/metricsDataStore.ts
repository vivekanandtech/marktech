import { create } from 'zustand'

const STALE_MS = 5 * 60 * 1000

export interface PeriodMetrics {
  metaSpend: number
  googleSpend: number
  blendedSpend: number
  metaReportedRevenue: number
  googleReportedRevenue: number
  shopifyNetRevenue: number
  metaSessions: number
  metaAttributedOrders: number
  googleAttributedOrders: number
  attributedCPR: number
  mer: number
  newCustomerCount: number
  nCAC: number
  newCustomerDataAvailable: boolean
  platformClaimedRevenue: number
  overClaimMultiplier: number
  metaChannelNetRevenue: number
  googleChannelNetRevenue: number
  metaOverClaimMultiplier: number
  googleOverClaimMultiplier: number
  sourceConfidence: 'exact' | 'approximate'
  metaRoas: number
  googleRoas: number
  blendedRoas: number
  totalSessions: number
  totalOrders: number
  conversionRate: number
}

export interface OverviewMetricsResponse {
  current: PeriodMetrics
  previous: PeriodMetrics
  deltas: Record<string, number>
  countryBreakdown: { country: string; orders: number; netSales: number }[]
  connected: { meta: boolean; google: boolean; shopify: boolean }
}

export interface ReconciliationDay {
  date: string
  platformClaimed: number
  shopifyTruth: number
  overClaimMultiplier: number
}

export interface ReconciliationTrendResponse {
  days: ReconciliationDay[]
  avgOverClaimMultiplier: number
  connected: { meta: boolean; google: boolean; shopify: boolean }
}

export type CacheKey = string // `${clientId}:${dateRange}:${country}`

export function makeMetricsCacheKey(clientId: string, dateRange: string, country: string): CacheKey {
  return `${clientId}:${dateRange}:${country}`
}

interface Slice<T> {
  data: T | null
  fetchedAt: number
  loading: boolean
  error: string | null
}

interface MetricsDataStore {
  overview: Record<CacheKey, Slice<OverviewMetricsResponse>>
  setOverview: (key: CacheKey, patch: Partial<Slice<OverviewMetricsResponse>>) => void
  isFresh: (key: CacheKey) => boolean
  invalidate: (key: CacheKey) => void

  reconciliation: Record<CacheKey, Slice<ReconciliationTrendResponse>>
  setReconciliation: (key: CacheKey, patch: Partial<Slice<ReconciliationTrendResponse>>) => void
  isReconciliationFresh: (key: CacheKey) => boolean
}

export const useMetricsDataStore = create<MetricsDataStore>((set, get) => ({
  overview: {},

  setOverview: (key, patch) =>
    set((s) => ({ overview: { ...s.overview, [key]: { ...s.overview[key], ...patch } } })),

  isFresh: (key) => {
    const entry = get().overview[key]
    return !!entry && !entry.loading && !entry.error &&
      entry.fetchedAt > 0 && Date.now() - entry.fetchedAt < STALE_MS
  },

  invalidate: (key) =>
    set((s) => ({ overview: { ...s.overview, [key]: { ...s.overview[key], fetchedAt: 0 } } })),

  reconciliation: {},

  setReconciliation: (key, patch) =>
    set((s) => ({ reconciliation: { ...s.reconciliation, [key]: { ...s.reconciliation[key], ...patch } } })),

  isReconciliationFresh: (key) => {
    const entry = get().reconciliation[key]
    return !!entry && !entry.loading && !entry.error &&
      entry.fetchedAt > 0 && Date.now() - entry.fetchedAt < STALE_MS
  },
}))
