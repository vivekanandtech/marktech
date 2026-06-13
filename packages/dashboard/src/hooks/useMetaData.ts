import { useEffect, useState } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { API } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

function metaFetch(path: string, metaToken: string | null) {
  const jwt = useAuthStore.getState().token
  return fetch(`${API}${path}`, {
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
  // Use the ad account assigned to this specific client — but only if it's
  // still one of the accounts the user has enabled for Marktech to use.
  const assignedAdAccountId = currentClient?.metaAdAccountId ?? null
  const selectedAdAccountId =
    assignedAdAccountId && enabledAdAccountIds?.includes(assignedAdAccountId) ? assignedAdAccountId : null
  const [data, setData] = useState<MetaCampaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected || !selectedAdAccountId) return
    setLoading(true)
    setError(null)
    metaFetch(`/api/meta/campaigns?clientId=${clientId}&adAccountId=${selectedAdAccountId}&dateRange=${dateRange}`, accessToken)
      .then(async (r) => {
        if (r.status === 401) { setMetaDisconnected(clientId); return }
        const json = await r.json()
        if (json.error) { setError(json.error); return }
        setData(json.data ?? [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [clientId, connected, selectedAdAccountId, accessToken, dateRange])

  return { data, loading, error }
}
