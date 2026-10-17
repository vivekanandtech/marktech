import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

export type ActionableCategory = 'scale' | 'fix' | 'creative' | 'geography' | 'tracking' | 'budget'
export type ActionableSeverity = 'critical' | 'warning' | 'opportunity' | 'info'
export type ActionableStatus = 'new' | 'done' | 'dismissed'

export interface KV { label: string; value: string }

export interface Actionable {
  id: string
  rank: number
  type: string
  category: ActionableCategory
  severity: ActionableSeverity
  platform: 'meta' | 'google' | 'shopify' | 'cross'
  action: string
  entityName: string
  entity: { level: 'campaign' | 'adset' | 'ad' | 'country' | 'account'; id: string | null; campaignId: string | null }
  context: string | null
  detail: string
  metrics: KV[]
  plan: KV[] | null
  topCreatives: { id: string; name: string; detail: string }[] | null
  topProducts: { name: string; detail: string }[] | null
  impact: number
  status: ActionableStatus
}

export interface ActionablesPayload {
  version: 2
  items: Actionable[]
  dateRange: string
  window: { since: string; until: string }
  clientName: string | null
  metaAccountName: string | null
  generatedAt: string
  notes: string[]
}

export const actionableTitle = (a: Actionable) => `${a.action} - ${a.entityName}`

// The copy format the client specified: "<Action> - <Entity>" then one metric per line.
export function actionableCopyText(a: Actionable): string {
  const lines = [actionableTitle(a), ...a.metrics.map((m) => `${m.label} ${m.value}`)]
  if (a.plan?.length) lines.push(...a.plan.map((p) => `${p.label}: ${p.value}`))
  return lines.join('\n')
}

interface ActionablesStore {
  payload: ActionablesPayload | null
  generating: boolean
  error: string | null
  fetchedForClient: string | null
  fetchLatest: (clientId: string) => Promise<void>
  generate: (clientId: string, dateRange: string) => Promise<void>
  updateStatus: (clientId: string, id: string, status: ActionableStatus) => Promise<void>
}

// In-memory, keyed to the client last fetched — a generation run belongs to
// one client and must never leak into another via persistence.
export const useActionablesStore = create<ActionablesStore>((set, get) => ({
  payload: null,
  generating: false,
  error: null,
  fetchedForClient: null,

  fetchLatest: async (clientId) => {
    if (get().fetchedForClient !== clientId) set({ payload: null })
    set({ error: null, fetchedForClient: clientId })
    try {
      const res = await apiFetch(`/api/actionables/latest?clientId=${encodeURIComponent(clientId)}`)
      const json = await res.json()
      if (get().fetchedForClient !== clientId) return
      if (json.error) { set({ error: json.error }); return }
      set({ payload: json.payload ?? null })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  generate: async (clientId, dateRange) => {
    set({ generating: true, error: null, fetchedForClient: clientId })
    try {
      const res = await apiFetch('/api/actionables/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, dateRange }),
      })
      const json = await res.json()
      if (get().fetchedForClient !== clientId) return
      if (json.error) { set({ error: json.error }); return }
      set({ payload: json })
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ generating: false })
    }
  },

  updateStatus: async (clientId, id, status) => {
    const prev = get().payload
    if (!prev) return
    set({ payload: { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, status } : i)) } })
    try {
      const res = await apiFetch(`/api/actionables/${encodeURIComponent(clientId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) set({ payload: prev })
    } catch {
      set({ payload: prev })
    }
  },
}))

// Open (not done/dismissed) critical + warning items — drives the Alerts badge.
export function openAlertCount(payload: ActionablesPayload | null): number {
  return (payload?.items ?? []).filter((i) => i.status === 'new' && (i.severity === 'critical' || i.severity === 'warning')).length
}

const SEVERITY_TEXT: Record<ActionableSeverity, string> = {
  critical: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  opportunity: 'text-emerald-600 dark:text-emerald-400',
  info: 'text-indigo-600 dark:text-indigo-400',
}
export const severityTextClass = (s: ActionableSeverity) => SEVERITY_TEXT[s] ?? SEVERITY_TEXT.info

// Open actionables that touch one campaign (its ad sets/ads) or one ad.
export function openActionablesFor(payload: ActionablesPayload | null, match: { campaignId?: string; adId?: string }): Actionable[] {
  return (payload?.items ?? []).filter((i) => i.status === 'new' && (
    (match.adId && i.entity.level === 'ad' && i.entity.id === match.adId) ||
    (match.campaignId && i.entity.campaignId === match.campaignId)
  ))
}
