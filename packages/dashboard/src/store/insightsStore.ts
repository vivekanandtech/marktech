import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

export type InsightSeverity = 'critical' | 'warning' | 'opportunity' | 'info'
export type InsightEntityType = 'account' | 'campaign' | 'creative'

export interface Insight {
  severity: InsightSeverity
  title: string
  message: string
  recommendation: string
  entityType: InsightEntityType
  entityId: string | null
}

export interface InsightsPayload {
  account: {
    spend: number; roas: number; ctr: number; cpa: number; cpm: number
    reach: number; impressions: number; clicks: number
  }
  campaigns: {
    id: string; name: string; spend: number; roas: number; ctr: number; cpa: number
    frequency: number; conversions: number; objective: string; status: string
  }[]
  creatives: {
    id: string; name: string; format: string; spend: number; roas: number
    ctr: number; frequency: number
  }[]
}

interface InsightsStore {
  insights: Insight[]
  loading: boolean
  error: string | null
  lastGeneratedAt: string | null
  generate: (payload: InsightsPayload) => Promise<void>
  getForEntity: (entityType: InsightEntityType, entityId: string) => Insight | null
}

// In-memory only (no persist) — insights are generated on-demand and tied to
// whatever data was current when the owner clicked "Generate"; they shouldn't
// silently carry over stale across days via localStorage.
export const useInsightsStore = create<InsightsStore>((set, get) => ({
  insights: [],
  loading: false,
  error: null,
  lastGeneratedAt: null,

  generate: async (payload) => {
    set({ loading: true, error: null })
    try {
      const res = await apiFetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      set({ insights: json.insights ?? [], loading: false, lastGeneratedAt: new Date().toISOString() })
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to generate insights', loading: false })
    }
  },

  getForEntity: (entityType, entityId) =>
    get().insights.find((i) => i.entityType === entityType && i.entityId === entityId) ?? null,
}))
