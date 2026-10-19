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

// Several components ask for the same data on one page (Overview, Meta page,
// Actionables…). One request per key at a time — duplicates used to triple
// the Meta calls on a small development-tier allowance. Requests are not
// aborted on unmount: results land in the shared store by key either way.
const inflight = new Set<string>()

// Call this whenever any /api/* request returns 401 "Unauthorized" (JWT expired).
// Logs the user out cleanly so ProtectedRoute redirects them to /login.
function handleExpiredSession() {
  useAuthStore.getState().logout()
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
  // enabledAdAccountIds lives only in this browser's storage — null on any new
  // device. The assigned account comes from the server, so trust it there
  // instead of silently showing no campaigns until someone re-picks accounts.
  const selectedAdAccountId =
    assignedAdAccountId && (enabledAdAccountIds === null || enabledAdAccountIds.includes(assignedAdAccountId))
      ? assignedAdAccountId
      : null

  const cacheKey = selectedAdAccountId
    ? makeCacheKey(clientId, selectedAdAccountId, dateRange)
    : ''

  const cached = useMetaDataStore((s) => (cacheKey ? s.campaigns[cacheKey] : undefined))

  useEffect(() => {
    if (!connected || !selectedAdAccountId || !cacheKey) return
    if (isFresh('campaigns', cacheKey)) return  // cache hit — skip fetch
    const key = `campaigns:${cacheKey}`
    if (inflight.has(key)) return
    inflight.add(key)
    setCampaigns(cacheKey, { loading: true, error: null })

    metaFetch(
      `/api/meta/campaigns?clientId=${clientId}&adAccountId=${selectedAdAccountId}&dateRange=${dateRange}`,
      accessToken,
    )
      .then(async (r) => {
        const json = await r.json()
        // 401 "Meta not connected" → token genuinely gone on the server side.
        // 401 "Unauthorized" → JWT expired (session issue, NOT a Meta disconnection).
        // Only clear Meta state if the server explicitly says the Meta token is missing.
        if (r.status === 401) {
          if (json.error === 'Meta not connected.') {
            setMetaDisconnected(clientId)
          } else {
            // JWT expired — redirect to login (preserves Meta connection state)
            handleExpiredSession()
          }
          return
        }
        if (json.error) {
          setCampaigns(cacheKey, { loading: false, error: json.error })
          return
        }
        setCampaigns(cacheKey, {
          data: json.data ?? [],
          accountInsights: json.accountInsights ?? null,
          previousAccountInsights: json.previousAccountInsights ?? null,
          staleAsOf: json.staleAsOf ?? null,
          partial: !!json.partial,
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        })
      })
      .catch((e) => setCampaigns(cacheKey, { loading: false, error: e.message }))
      .finally(() => inflight.delete(key))
  // cacheKey encodes clientId + adAccountId + dateRange — re-run only when
  // the logical data key changes, not when accessToken silently rotates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, cacheKey])

  return {
    data:            cached?.data           ?? [],
    accountInsights: cached?.accountInsights ?? null,
    previousAccountInsights: cached?.previousAccountInsights ?? null,
    staleAsOf:       cached?.staleAsOf       ?? null,
    partial:         cached?.partial         ?? false,
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
    const key = `creatives:${cacheKey}`
    if (inflight.has(key)) return
    inflight.add(key)
    setCreatives(cacheKey, { loading: true, error: null })

    metaFetch(
      `/api/meta/top-ads?clientId=${clientId}&adAccountId=${selectedAdAccountId}&limit=25`,
      accessToken,
    )
      .then(async (r) => {
        const json = await r.json()
        if (json.error) { setCreatives(cacheKey, { loading: false, error: json.error }); return }
        setCreatives(cacheKey, {
          data: json.data ?? [],
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        })
      })
      .catch((e) => setCreatives(cacheKey, { loading: false, error: e.message }))
      .finally(() => inflight.delete(key))
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
    const key = `daily:${cacheKey}`
    if (inflight.has(key)) return
    inflight.add(key)
    setDailyInsights(cacheKey, { loading: true, error: null })

    metaFetch(
      `/api/meta/daily-insights?clientId=${clientId}&adAccountId=${selectedAdAccountId}&dateRange=${dateRange}`,
      accessToken,
    )
      .then(async (r) => {
        const json = await r.json()
        if (json.error) { setDailyInsights(cacheKey, { loading: false, error: json.error }); return }
        setDailyInsights(cacheKey, {
          data: json.data ?? [],
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        })
      })
      .catch((e) => setDailyInsights(cacheKey, { loading: false, error: e.message }))
      .finally(() => inflight.delete(key))
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
  const [partial, setPartial] = useState(false)
  const [staleAsOf, setStaleAsOf] = useState<string | null>(null)
  const prevKey = useRef<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { prevKey.current = null; setAttempt((a) => a + 1) }

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
        setPartial(!!json.partial)
        setStaleAsOf(json.staleAsOf ?? null)
      })
      .catch((e) => { setError(e.message); setAdSets([]) })
      .finally(() => setLoading(false))
  }, [campaignId, dateRange, clientId, accessToken, attempt])

  return { adSets, loading, error, retry, staleAsOf, partial }
}

// ─── Ad set detail ────────────────────────────────────────────────────────────
// Lazy-loads one ad set's ads on row expand. campaign-detail no longer fetches
// ads eagerly for the whole campaign (large accounts tripped Meta's
// development-tier ads_insights usage budget) — this scopes the heavy
// creative+insights fetch to a single ad set instead, which is cheap enough
// to stay well under that limit.

export function useAdSetAds(adSetId: string | null, dateRange: string) {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const accessToken = currentClient?.meta.accessToken ?? null

  const [ads, setAds] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partial, setPartial] = useState(false)
  const prevKey = useRef<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { prevKey.current = null; setAttempt((a) => a + 1) }

  useEffect(() => {
    if (!adSetId) return
    const key = `${adSetId}:${dateRange}`
    if (prevKey.current === key) return
    prevKey.current = key
    setAds(null)
    setError(null)
    setLoading(true)
    metaFetch(
      `/api/meta/adset-ads?clientId=${clientId}&adSetId=${adSetId}&dateRange=${dateRange}`,
      accessToken
    )
      .then(async (r) => {
        const json = await r.json()
        if (json.error) { setError(json.error); setAds([]); return }
        setAds(json.ads ?? [])
        setPartial(!!json.partial)
      })
      .catch((e) => { setError(e.message); setAds([]) })
      .finally(() => setLoading(false))
  }, [adSetId, dateRange, clientId, accessToken, attempt])

  return { ads, loading, error, retry, partial }
}
