import { useEffect, useState } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { apiFetch } from '@/lib/api'
import { useMetricsDataStore, makeMetricsCacheKey, OverviewMetricsResponse } from '@/store/metricsDataStore'

export type { OverviewMetricsResponse, PeriodMetrics } from '@/store/metricsDataStore'

const PLATFORM_ERROR_RETRY_MS = 30_000

export function useOverviewMetrics() {
  const { clientId, dateRange, country } = useFilterStore()
  const { clients } = useClientStore()
  const { overview, setOverview, isFresh } = useMetricsDataStore()
  // Bumped after a platform-error response to force the effect below to
  // re-run — isFresh() already treats that response as stale, but nothing
  // else would trigger a re-fetch while the user just stays on the page.
  const [retryTick, setRetryTick] = useState(0)

  const currentClient = clients.find((c) => c.id === clientId)
  const connectedSomewhere = !!(currentClient?.meta.connected || currentClient?.shopify.connected || currentClient?.google?.connected)

  const cacheKey = makeMetricsCacheKey(clientId, dateRange, country ?? 'all')
  const cached = overview[cacheKey]

  useEffect(() => {
    if (!connectedSomewhere || !clientId) return
    if (isFresh(cacheKey)) return

    const controller = new AbortController()
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    setOverview(cacheKey, { loading: true, error: null })

    const params = new URLSearchParams({ clientId, dateRange })
    if (country && country !== 'all') params.set('country', country)

    apiFetch(`/api/metrics/overview?${params}`, { signal: controller.signal })
      .then(async (r) => {
        if (controller.signal.aborted) return
        const json = await r.json()
        if (controller.signal.aborted) return
        if (json.error) {
          setOverview(cacheKey, { loading: false, error: json.error })
          return
        }
        setOverview(cacheKey, {
          data: json as OverviewMetricsResponse,
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        })
        if (json.platformErrors?.meta || json.platformErrors?.google) {
          retryTimer = setTimeout(() => setRetryTick((t) => t + 1), PLATFORM_ERROR_RETRY_MS)
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setOverview(cacheKey, { loading: false, error: e.message })
      })

    return () => { controller.abort(); if (retryTimer) clearTimeout(retryTimer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedSomewhere, cacheKey, retryTick])

  return {
    data: cached?.data ?? null,
    loading: cached?.loading ?? false,
    error: cached?.error ?? null,
    connectedSomewhere,
  }
}
