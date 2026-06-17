import { useEffect, useState, useRef } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
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
    spend: string
    impressions: string
    clicks: string
    reach: string
    ctr: string
    cpm: string
    purchase_roas?: { action_type: string; value: string }[]
    action_values?: { action_type: string; value: string }[]
    actions?: { action_type: string; value: string }[]
  } | null
}

export function useMetaCampaigns() {
  const { clientId, dateRange } = useFilterStore()
  const { clients, setMetaDisconnected } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const { connected, accessToken, enabledAdAccountIds } = currentClient?.meta ?? {
    connected: false, accessToken: null, enabledAdAccountIds: null,
  }
  const assignedAdAccountId = currentClient?.metaAdAccountId ?? null
  const selectedAdAccountId =
    assignedAdAccountId && enabledAdAccountIds?.includes(assignedAdAccountId) ? assignedAdAccountId : null

  const [data, setData] = useState<MetaCampaign[]>([])
  const [accountInsights, setAccountInsights] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected || !selectedAdAccountId) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
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
        if (json.error) { setError(json.error); return }
        setData(json.data ?? [])
        setAccountInsights(json.accountInsights ?? null)
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [clientId, connected, selectedAdAccountId, accessToken, dateRange])

  return { data, accountInsights, loading, error }
}

// Lazy-loads ad sets + ads for a single campaign when its row is expanded.
export function useCampaignDetail(campaignId: string | null, dateRange: string) {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const accessToken = currentClient?.meta.accessToken ?? null

  const [adSets, setAdSets] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const prevKey = useRef<string | null>(null)

  useEffect(() => {
    if (!campaignId) return
    const key = `${campaignId}:${dateRange}`
    if (prevKey.current === key) return   // already loaded for this campaign+range
    prevKey.current = key
    setAdSets(null)
    setLoading(true)
    metaFetch(
      `/api/meta/campaign-detail?clientId=${clientId}&campaignId=${campaignId}&dateRange=${dateRange}`,
      accessToken
    )
      .then(async (r) => {
        const json = await r.json()
        setAdSets(json.adSets ?? [])
      })
      .catch(() => setAdSets([]))
      .finally(() => setLoading(false))
  }, [campaignId, dateRange, clientId, accessToken])

  return { adSets, loading }
}
