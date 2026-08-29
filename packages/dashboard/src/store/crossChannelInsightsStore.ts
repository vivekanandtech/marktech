import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

export type RecommendationCategory = 'scale' | 'fix' | 'tracking' | 'creative' | 'budget' | 'geography'
export type RecommendationConfidence = 'high' | 'medium' | 'low'
export type RecommendationEffort = 'low' | 'medium' | 'high'
export type RecommendationStatus = 'new' | 'done' | 'dismissed'

export interface RankedRecommendation {
  rank: number
  category: RecommendationCategory
  title: string
  evidence: string
  expectedImpact: string
  confidence: RecommendationConfidence
  effort: RecommendationEffort
  sourceMetricId: string | null
  sourceEntity: { type: 'campaign' | 'account' | 'channel'; id: string | null; platform: 'meta' | 'google' | 'shopify' | null } | null
  status: RecommendationStatus
}

export interface CrossChannelInsightsPayload {
  recommendations: RankedRecommendation[]
  dateRange: string
  generatedAt: string
}

interface CrossChannelInsightsStore {
  payload: CrossChannelInsightsPayload | null
  loading: boolean
  error: string | null
  fetchedForClient: string | null
  fetchLatest: (clientId: string) => Promise<void>
  generate: (clientId: string, dateRange: string) => Promise<void>
  updateStatus: (clientId: string, rank: number, status: RecommendationStatus) => Promise<void>
}

// In-memory only, keyed to whichever client was last fetched — mirrors
// insightsStore.ts's reasoning: recommendations are tied to a specific
// generation run, not something to silently carry across clients via persist.
export const useCrossChannelInsightsStore = create<CrossChannelInsightsStore>((set, get) => ({
  payload: null,
  loading: false,
  error: null,
  fetchedForClient: null,

  fetchLatest: async (clientId) => {
    set({ loading: true, error: null })
    try {
      const res = await apiFetch(`/api/insights/cross-channel/latest?clientId=${encodeURIComponent(clientId)}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      set({ payload: json.payload ?? null, loading: false, fetchedForClient: clientId })
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to load insights', loading: false })
    }
  },

  generate: async (clientId, dateRange) => {
    set({ loading: true, error: null })
    try {
      const res = await apiFetch('/api/insights/cross-channel/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, dateRange }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      set({ payload: json, loading: false, fetchedForClient: clientId })
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to generate insights', loading: false })
    }
  },

  updateStatus: async (clientId, rank, status) => {
    const prev = get().payload
    if (!prev) return
    // Optimistic update — feels instant on a click, corrected below if the PATCH fails.
    set({ payload: { ...prev, recommendations: prev.recommendations.map((r) => (r.rank === rank ? { ...r, status } : r)) } })
    try {
      const res = await apiFetch(`/api/insights/cross-channel/${encodeURIComponent(clientId)}/${rank}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      set({ payload: json })
    } catch (err: any) {
      set({ payload: prev, error: err.message ?? 'Failed to update status' })
    }
  },
}))
