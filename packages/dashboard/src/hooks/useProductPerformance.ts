import { useEffect, useState, useRef, useCallback } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { apiFetch } from '@/lib/api'

export interface ProductRow {
  productId: string
  title: string
  shopifyRevenue: number
  shopifyOrders: number
  unitsSold: number
  googleCost: number
  googleConversions: number
  googleConversionsValue: number
  googleRoas: number
  hasGoogleData: boolean
  sessions: number
  addToCart: number
  checkoutsInitiated: number
}

export interface ProductPerformanceResponse {
  products: ProductRow[]
  deltas: Record<string, Record<string, number>>
  connected: { shopify: boolean; google: boolean }
  googleAccountName: string | null
  googleMatchedProductCount: number
}

// 5-min micro-cache, same TTL/shape convention as useGoogleData.ts.
const cache = new Map<string, { data: ProductPerformanceResponse; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

function cacheKey(clientId: string, dateRange: string) {
  return `products:${clientId}:${dateRange}`
}

export function useProductPerformance() {
  const { clientId, dateRange } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const connected = !!(currentClient?.shopify.connected || currentClient?.google?.connected)

  const [data, setData] = useState<ProductPerformanceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    if (clientId && dateRange) {
      cache.delete(cacheKey(clientId, dateRange))
      setRefreshKey((k) => k + 1)
    }
  }, [clientId, dateRange])

  useEffect(() => {
    if (!connected || !clientId) { setData(null); return }

    const key = cacheKey(clientId, dateRange)
    const cached = cache.get(key)
    if (cached && Date.now() - cached.ts < CACHE_TTL && refreshKey === 0) {
      setData(cached.data)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    setError(null)

    apiFetch(`/api/products/performance?clientId=${encodeURIComponent(clientId)}&dateRange=${dateRange}`, { signal: ac.signal })
      .then(async (r) => {
        const json = await r.json()
        if (ac.signal.aborted) return
        if (json.error) throw new Error(json.error)
        cache.set(key, { data: json, ts: Date.now() })
        setData(json)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })

    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, clientId, dateRange, refreshKey])

  return { data, loading, error, connected, refresh }
}
