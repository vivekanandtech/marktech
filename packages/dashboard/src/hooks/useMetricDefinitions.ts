import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

export interface MetricSource {
  id: string
  name: string
  description: string
}

export interface MetricDefinition {
  id: string
  label: string
  definition: string
  formula: string
  sources: string[]
  pipelineCadence: string
  caveat?: string
}

interface DefinitionsResponse {
  definitions: Record<string, MetricDefinition>
  sources: Record<string, MetricSource>
}

// Static content, fetched once and kept for the life of the tab — no need for
// the 5-min-TTL cache pattern used by live data hooks elsewhere.
let cached: DefinitionsResponse | null = null
let inFlight: Promise<DefinitionsResponse> | null = null

export function useMetricDefinitions() {
  const [data, setData] = useState<DefinitionsResponse | null>(cached)

  useEffect(() => {
    if (cached) { setData(cached); return }
    if (!inFlight) {
      inFlight = apiFetch('/api/metrics/definitions')
        .then((r) => r.json())
        .then((json) => { cached = json; return json })
        .catch(() => ({ definitions: {}, sources: {} }))
    }
    inFlight.then(setData)
  }, [])

  return data
}
