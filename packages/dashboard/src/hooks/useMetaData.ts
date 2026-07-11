import { useEffect, useState, useRef } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useMetaDataStore, makeCacheKey } from '@/store/metaDataStore'
import { API } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

function metaFetch(path: string, metaToken: string | null, signal?: AbortSignal) {
  const jwt = useAuthStore.getState().token
  return fetch(`${API}${path}`, {
    signal,
    headers: {
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(metaToken ? { 'x-meta-token': metaToken } : {}),
    },
  })
}

export interface MetaCampaign {
  id: string
  name: string
  status: string
  effective_status: string
  objective: string
  daily_budget?: string
  lifetime_budget?: string
  insights: {
    spend: string; impressions: string; clicks: string; reach: string
    ctr: string; cpm: string
    purchase_roas?: { action_type: string; value: string }[]
    action_values?: { action_type: string; value: string }[]
    actions?: { action_type: string; value: string }[]
  } | null
}

// ─── Campaigns ───────────────────────────────────────────────────────────────
// Data lives in metaDataStore (Zustand) so it survives navigation. On mount,
// the hook checks if cached data is fresh (< 5 min) and skips the network
// call. Callers can pass `forceRefresh=true` (via useMetaDataStore.invalidate)
// to bypass the cache — e.g. from a Refresh button.

export function useMetaCampaigns() {
  const { clientId, dateRange } = useFilterStore()
  const { clients, setMetaDisconnected } = useClientStore()
  const { setCampaigns, isFresh } = useMetaDataStore()

  const currentClient = clients.find((c) => c.id === clientId)
  const { connected, accessToken, enabledAdAccountIds } = currentClient?.meta ?? {
    connected: false, accessToken: null, enabledAdAccountIds: null,
  }
  const assignedAdAccountId = currentClient?.metaAdAccountId ?? null
  const selectedAdAccountId =
    assignedAdAccountId && enabledAdAccountIds?.includes(assignedAdAccountId)
      ? assignedAdAccountId
      : null

  const cacheKey = selectedAdAccountId
    ? makeCacheKey(clientId, selectedAdAccountId, dateRange)
    : ''

  const cached = useMetaDataStore((s) => (cacheKey ? s.campaigns[cacheKey] : undefined))

  useEffect(() => {
    if (!connected || !selectedAdAccountId || !cacheKey) return
    if (isFresh('campaigns', cacheKey)) return  // cache hit — skip fetch

    const controller = new AbortController()
    setCampaigns(cacheKey, { loading: true, error: null })

    metaFetch(
      `/api/meta/campaigns?clientId=${clientId}&adAccountId=${selectedAdAccountId}&dateRange=${dateRange}`,
      accessToken,
      controller.signal
    )
      .then(async (r) => {
        if (controller.signal.aborted) return
        if (r.status === 401) { setMetaDisconnected(clientId); return }
        const json = await r.json()
        if (controller.signal.aborted) return
        if (json.error) {
          setCampaigns(cacheKey, { loading: false, error: json.error })
          return
        }
        setCampaigns(cacheKey, {
          data: json.data ?? [],
          accountInsights: json.accountInsights ?? null,
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        })
      })
      .catch((e) => {
        if (e.name !== 'AbortError')
          setCampaigns(cacheKey, { loading: false, error: e.message })
      })

    return () => controller.abort()
  // cacheKey encodes clientId + adAccountId + dateRange — re-run only when
  // the logical data key changes, not when accessToken silently rotates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, cacheKey])

  return {
    data:            cached?.data           ?? [],
    accountInsights: cached?.accountInsights ?? null,
    loading:         cached?.loading         ?? false,
    error:           cached?.error           ?? null,
  }
}

// ─── Creatives ───────────────────────────────────────────────────────────────

export function useMetaCreatives() {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const { setCreatives, isFresh } = useMetaDataStore()

  const currentClient = clients.find((c) => c.id === clientId)
  const { connected, accessToken } = currentClient?.meta ?? { connected: false, accessToken: null }
  const selectedAdAccountId = currentClient?.metaAdAccountId ?? null

  // Creatives always fetch 30 days regardless of dateRange
  const cacheKey = selectedAdAccountId
    ? makeCacheKey(clientId, selectedAdAccountId, 'creatives')
    : ''
  const cached = useMetaDataStore((s) => (cacheKey ? s.creatives[cacheKey] : undefined))

  useEffect(() => {
    if (!connected || !selectedAdAccountId || !cacheKey) return
    if (isFresh('creatives', cacheKey)) return

    const controller = new AbortController()
    setCreatives(cacheKey, { loading: true, error: null })

    metaFetch(
      `/api/meta/top-ads?clientId=${clientId}&adAccountId=${selectedAdAccountId}&limit=25`,
      accessToken,
      controller.signal
    )
      .then(async (r) => {
        if (controller.signal.aborted) return
        const json = await r.json()
        if (json.error) { setCreatives(cacheKey, { loading: false, error: json.error }); return }
        setCreatives(cacheKey, {
          data: json.data ?? [],
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        })
      })
      .catch((e) => {
        if (e.name !== 'AbortError')
          setCreatives(cacheKey, { loading: false, error: e.message })
      })

    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, cacheKey])

  return {
    data:    cached?.data    ?? [],
    loading: cached?.loading ?? false,
    error:   cached?.error   ?? null,
  }
}

// ─── Daily insights ──────────────────────────────────────────────────────────

export function useMetaDailyInsights() {
  const { clientId, dateRange } = useFilterStore()
  const { clients } = useClientStore()
  const { setDailyInsights, isFresh } = useMetaDataStore()

  const currentClient = clients.find((c) => c.id === clientId)
  const { connected, accessToken } = currentClient?.meta ?? { connected: false, accessToken: null }
  const selectedAdAccountId = currentClient?.metaAdAccountId ?? null

  const cacheKey = selectedAdAccountId
    ? makeCacheKey(clientId, selectedAdAccountId, dateRange)
    : ''
  const cached = useMetaDataStore((s) => (cacheKey ? s.dailyInsights[cacheKey] : undefined))

  useEffect(() => {
    if (!connected || !selectedAdAccountId || !cacheKey) return
    if (isFresh('dailyInsights', cacheKey)) return

    const controller = new AbortController()
    setDailyInsights(cacheKey, { loading: true, error: null })

    metaFetch(
      `/api/meta/daily-insights?clientId=${clientId}&adAccountId=${selectedAdAccountId}&dateRange=${dateRange}`,
      accessToken,
      controller.signal
    )
      .then(async (r) => {
        if (controller.signal.aborted) return
        const json = await r.json()
        if (controller.signal.aborted) return
        if (json.error) { setDailyInsights(cacheKey, { loading: false, error: json.error }); return }
        setDailyInsights(cacheKey, {
          data: json.data ?? [],
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        })
      })
      .catch((e) => {
        if (e.name !== 'AbortError')
          setDailyInsights(cacheKey, { loading: false, error: e.message })
      })

    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, cacheKey])

  return {
    data:    cached?.data    ?? [],
    loading: cached?.loading ?? false,
    error:   cached?.error   ?? null,
  }
}

// ─── Campaign detail ─────────────────────────────────────────────────────────
// Lazy-loads ad sets + ads for a single campaign on row expand.
// Intentionally kept in local component state — expansion is per-row and
// within a single page session. No cross-navigation caching needed here.

export function useCampaignDetail(campaignId: string | null, dateRange: string) {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const accessToken = currentClient?.meta.accessToken ?? null

  const [adSets, setAdSets] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevKey = useRef<string | null>(null)

  useEffect(() => {
    if (!campaignId) return
    const key = `${campaignId}:${dateRange}`
    if (prevKey.current === key) return
    prevKey.current = key
    setAdSets(null)
    setError(null)
    setLoading(true)
    metaFetch(
      `/api/meta/campaign-detail?clientId=${clientId}&campaignId=${campaignId}&dateRange=${dateRange}`,
      accessToken
    )
      .then(async (r) => {
        const json = await r.json()
        if (json.error) { setError(json.error); setAdSets([]); return }
        setAdSets(json.adSets ?? [])
      })
      .catch((e) => { setError(e.message); setAdSets([]) })
      .finally(() => setLoading(false))
  }, [campaignId, dateRange, clientId, accessToken])

  return { adSets, loading, error }
}
