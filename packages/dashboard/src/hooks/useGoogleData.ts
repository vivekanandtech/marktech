import { useEffect, useState, useRef, useCallback } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { API } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

function googleFetch(path: string, signal?: AbortSignal) {
  const jwt = useAuthStore.getState().token
  return fetch(`${API}${path}`, {
    signal,
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  })
}

// ─── Micro-cache (5 min TTL) ──────────────────────────────────────────────────
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

function getCached(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}

function setCached(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() })
}

export function invalidateGoogleCache(key: string) {
  cache.delete(key)
}

export function makeGoogleCacheKey(clientId: string, dateRange: string) {
  return `google:campaigns:${clientId}:${dateRange}`
}

// ─── Google campaign raw shape (from API) ─────────────────────────────────────
export interface GoogleCampaignRaw {
  campaign: {
    id: string
    name: string
    status: string
    advertisingChannelType: string
  }
  metrics: {
    costMicros: string
    impressions: string
    clicks: string
    conversions: number
    conversionsValue: number
    ctr: number
    averageCpc: string
    averageCpm: string
  }
}

export interface GoogleAccountInsightsRaw {
  costMicros: number
  impressions: number
  clicks: number
  conversions: number
  conversionsValue: number
}

// ─── useGoogleCampaigns ───────────────────────────────────────────────────────
export function useGoogleCampaigns() {
  const { clientId, dateRange } = useFilterStore()
  const { clients, setGoogleDisconnected } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const connected = currentClient?.google?.connected ?? false

  const [data, setData] = useState<GoogleCampaignRaw[]>([])
  const [accountInsights, setAccountInsights] = useState<GoogleAccountInsightsRaw | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    if (clientId && dateRange) {
      invalidateGoogleCache(makeGoogleCacheKey(clientId, dateRange))
      setRefreshKey((k) => k + 1)
    }
  }, [clientId, dateRange])

  useEffect(() => {
    if (!connected || !clientId) { setData([]); setAccountInsights(null); return }

    const cacheKey = makeGoogleCacheKey(clientId, dateRange)
    const cached = getCached(cacheKey)
    if (cached && refreshKey === 0) {
      setData(cached.campaigns)
      setAccountInsights(cached.accountInsights)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    setError(null)

    googleFetch(`/api/google/campaigns?clientId=${clientId}&dateRange=${dateRange}`, ac.signal)
      .then(async (r) => {
        const json = await r.json()
        // 401 "Google Ads not connected." → the token itself is gone/invalid on
        // the server side (e.g. a revoked refresh token) — that's a Google
        // disconnection, not a dead login session. Only a bare/other 401
        // (JWT actually expired) should log the user out of the whole app.
        // Matches the same distinction already made in useMetaData.ts.
        if (r.status === 401) {
          if (json.error === 'Google Ads not connected.') {
            setGoogleDisconnected(clientId)
            return null
          }
          useAuthStore.getState().logout()
          throw new Error('session_expired')
        }
        return json
      })
      .then((json) => {
        if (!json) return  // handled above (disconnected) — nothing further to do
        if (json.error) throw new Error(json.error)
        const campaigns = json.data ?? []
        const acctIns = json.accountInsights ?? null
        setData(campaigns)
        setAccountInsights(acctIns)
        setCached(cacheKey, { campaigns, accountInsights: acctIns })
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [connected, clientId, dateRange, refreshKey])

  return { data, accountInsights, loading, error, refresh }
}

// ─── useGoogleAdGroups ────────────────────────────────────────────────────────
export function useGoogleAdGroups(campaignId: string | null) {
  const { clientId, dateRange } = useFilterStore()
  const [adGroups, setAdGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!campaignId || !clientId) { setAdGroups([]); return }

    const ac = new AbortController()
    setLoading(true)
    setError(null)

    googleFetch(
      `/api/google/ad-groups?clientId=${clientId}&campaignId=${campaignId}&dateRange=${dateRange}`,
      ac.signal
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setAdGroups(json.adGroups ?? [])
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [campaignId, clientId, dateRange])

  return { adGroups, loading, error }
}
