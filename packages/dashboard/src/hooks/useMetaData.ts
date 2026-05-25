import { useEffect, useState } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useMetaStore } from '@/store/metaStore'
import { apiFetch } from '@/lib/api'

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
  const { clientId } = useFilterStore()
  const { connected, selectedAdAccountId, setDisconnected } = useMetaStore()
  const [data, setData] = useState<MetaCampaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected || !selectedAdAccountId) return
    setLoading(true)
    setError(null)
    apiFetch(`/api/meta/campaigns?clientId=${clientId}&adAccountId=${selectedAdAccountId}`)
      .then(async (r) => {
        if (r.status === 401) { setDisconnected(); return }
        const json = await r.json()
        if (json.error) { setError(json.error); return }
        setData(json.data ?? [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [clientId, connected, selectedAdAccountId])

  return { data, loading, error }
}

export function useMetaInsights(datePreset = 'last_30d') {
  const { clientId } = useFilterStore()
  const { connected, selectedAdAccountId } = useMetaStore()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!connected || !selectedAdAccountId) return
    setLoading(true)
    setError(null)
    apiFetch(`/api/meta/insights?clientId=${clientId}&adAccountId=${selectedAdAccountId}&datePreset=${datePreset}&level=campaign`)
      .then(async (r) => {
        const json = await r.json()
        setData(json.data ?? [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [clientId, connected, selectedAdAccountId, datePreset])

  return { data, loading, error }
}
