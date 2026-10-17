import { MetricTrend, isMetricImproving } from './meta-transform'

const MICROS = 1_000_000

export function microsToCurrency(micros: string | number | undefined | null): number {
  return Number(micros ?? 0) / MICROS
}

interface GoogleMetrics {
  costMicros?: string | number
  impressions?: string | number
  clicks?: string | number
  conversions?: number
  conversionsValue?: number
  ctr?: number
  averageCpc?: string | number
}

function deriveGoogleMetrics(m: GoogleMetrics | null | undefined) {
  const spend = microsToCurrency(m?.costMicros)
  const impressions = Number(m?.impressions ?? 0)
  const clicks = Number(m?.clicks ?? 0)
  const conversions = Number(m?.conversions ?? 0)
  const conversionsValue = Number(m?.conversionsValue ?? 0)
  const ctr = (m?.ctr ?? 0) * 100 // GAQL ctr is a 0-1 fraction; the rest of the app renders CTR as a %
  const cpc = microsToCurrency(m?.averageCpc)
  const roas = spend > 0 ? conversionsValue / spend : 0
  const cpa = conversions > 0 ? spend / conversions : 0
  return {
    spend, impressions, clicks, conversions, roas, ctr, cpc, cpa, reach: 0, frequency: 0,
    results: conversions, resultLabel: 'Conversions', costPerResult: cpa,
  }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

function computeGoogleTrend(current: GoogleMetrics | null | undefined, previous: GoogleMetrics | null | undefined): MetricTrend | null {
  if (!previous) return null
  const cur = deriveGoogleMetrics(current)
  const prev = deriveGoogleMetrics(previous)
  if (prev.spend <= 0) return null
  return {
    spendPct: pctChange(cur.spend, prev.spend),
    roasPct: pctChange(cur.roas, prev.roas),
    ctrPct: pctChange(cur.ctr, prev.ctr),
    cpaPct: pctChange(cur.cpa, prev.cpa),
    resultsPct: pctChange(cur.results, prev.results),
    cprPct: pctChange(cur.costPerResult, prev.costPerResult),
  }
}

function deriveActionTag(roas: number): string {
  return roas >= 3 ? 'scale' : roas >= 1.5 ? 'watch' : 'optimise'
}

export function statusLabel(status: string | undefined): string {
  return status === 'ENABLED' ? 'active' : status === 'PAUSED' ? 'paused' : 'archived'
}

export { isMetricImproving }

export function transformGoogleAd(raw: any) {
  const metrics = deriveGoogleMetrics(raw.metrics)
  return {
    id: raw.adGroupAd?.ad?.id ?? String(Math.random()),
    name: raw.adGroupAd?.ad?.name ?? raw.adGroupAd?.ad?.type ?? 'Ad',
    format: 'image', // Google ad creative format isn't fetched in this query — cosmetic only
    status: statusLabel(raw.adGroupAd?.status),
    thumbnailUrl: '',
    ...metrics,
    actionTag: deriveActionTag(metrics.roas),
    trend: computeGoogleTrend(raw.metrics, raw.previousMetrics),
  }
}

export function transformGoogleAdGroup(raw: any) {
  const metrics = deriveGoogleMetrics(raw.metrics)
  const ads = (Array.isArray(raw.ads) ? raw.ads : []).map(transformGoogleAd)
  return {
    id: raw.adGroup?.id ?? String(Math.random()),
    name: raw.adGroup?.name ?? 'Unnamed ad group',
    audience: '',
    status: statusLabel(raw.adGroup?.status),
    ...metrics,
    actionTag: deriveActionTag(metrics.roas),
    trend: computeGoogleTrend(raw.metrics, raw.previousMetrics),
    ads,
  }
}

const CHANNEL_LABELS: Record<string, string> = {
  SEARCH: 'Search', DISPLAY: 'Display', SHOPPING: 'Shopping',
  PERFORMANCE_MAX: 'PMax', VIDEO: 'Video', MULTI_CHANNEL: 'App',
  DISCOVERY: 'Discovery', DEMAND_GEN: 'Demand Gen', SMART: 'Smart',
}

export function channelLabel(type: string | undefined): string {
  return CHANNEL_LABELS[type ?? ''] ?? type ?? ''
}

export function transformGoogleCampaign(raw: any) {
  const metrics = deriveGoogleMetrics(raw.metrics)
  return {
    id: raw.campaign?.id ?? String(Math.random()),
    name: raw.campaign?.name ?? 'Unnamed campaign',
    platform: 'google' as const,
    status: statusLabel(raw.campaign?.status),
    type: 'prospecting' as const,
    market: '',
    objective: channelLabel(raw.campaign?.advertisingChannelType),
    dailyBudget: 0, // not fetched in this query
    ...metrics,
    actionTag: deriveActionTag(metrics.roas),
    trend: computeGoogleTrend(raw.metrics, raw.previousMetrics),
    adSets: [], // lazy-loaded on expand, same pattern as Meta
  }
}
