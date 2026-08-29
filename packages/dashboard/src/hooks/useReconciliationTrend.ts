import { useEffect } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { apiFetch } from '@/lib/api'
import { useMetricsDataStore, makeMetricsCacheKey, ReconciliationTrendResponse } from '@/store/metricsDataStore'

export type { ReconciliationTrendResponse, ReconciliationDay } from '@/store/metricsDataStore'

export function useReconciliationTrend() {
  const { clientId, dateRange } = useFilterStore()
  const { clients } = useClientStore()
  const { reconciliation, setReconciliation, isReconciliationFresh } = useMetricsDataStore()

  const currentClient = clients.find((c) => c.id === clientId)
  const connectedSomewhere = !!(currentClient?.meta.connected || currentClient?.shopify.connected || currentClient?.google?.connected)

  const cacheKey = makeMetricsCacheKey(clientId, dateRange, 'all')
  const cached = reconciliation[cacheKey]

  useEffect(() => {
    if (!connectedSomewhere || !clientId) return
    if (isReconciliationFresh(cacheKey)) return

    const controller = new AbortController()
    setReconciliation(cacheKey, { loading: true, error: null })

    const params = new URLSearchParams({ clientId, dateRange })

    apiFetch(`/api/metrics/reconciliation?${params}`, { signal: controller.signal })
      .then(async (r) => {
        if (controller.signal.aborted) return
        const json = await r.json()
        if (controller.signal.aborted) return
        if (json.error) {
          setReconciliation(cacheKey, { loading: false, error: json.error })
          return
        }
        setReconciliation(cacheKey, {
          data: json as ReconciliationTrendResponse,
          fetchedAt: Date.now(),
          loading: false,
          error: null,
        })
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setReconciliation(cacheKey, { loading: false, error: e.message })
      })

    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedSomewhere, cacheKey])

  return {
    data: cached?.data ?? null,
    loading: cached?.loading ?? false,
    error: cached?.error ?? null,
    connectedSomewhere,
  }
}
