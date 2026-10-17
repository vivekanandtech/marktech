import { PURCHASE_ACTION_TYPES, maxActionCount, maxActionValue, getFunnelCounts } from './meta-actions'
export type { MetaFunnelCounts } from './meta-actions'

export const safeFloat = (v: any) => { const n = parseFloat(v ?? '0'); return isFinite(n) ? n : 0 }
export const safeInt   = (v: any) => { const n = parseInt(v ?? '0', 10); return isFinite(n) ? n : 0 }

function getConversions(ins: any): number {
  return maxActionCount(ins, PURCHASE_ACTION_TYPES)
}

function getConversionValue(ins: any): number {
  return maxActionValue(ins, PURCHASE_ACTION_TYPES)
}

// Per-metric period-over-period change, shown inline next to each metric value
// instead of a single dedicated Trend column. null means "no previous-period
// data to compare against" (e.g. campaign created mid-window) — the UI should
// render nothing rather than a misleading 0%.
export interface MetricTrend {
  spendPct: number | null
  roasPct: number | null
  ctrPct: number | null
  cpaPct: number | null
  resultsPct?: number | null
  cprPct?: number | null
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

export function computeTrend(currentIns: any, previousIns: any | null | undefined): MetricTrend | null {
  if (!previousIns) return null
  const cur = transformInsightMetrics(currentIns)
  const prev = transformInsightMetrics(previousIns)
  // Didn't deliver last period — every metric would read a meaningless +100%.
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

// Higher is better for roas/ctr/results; lower is better for cpa; spend has no
// inherent "good" direction (scaling a winner up is a deliberate choice),
// so it's never shown as a regression.
export function isMetricImproving(metric: 'spend' | 'roas' | 'ctr' | 'cpa' | 'results', pct: number): boolean {
  if (metric === 'cpa') return pct <= 0
  if (metric === 'spend') return true
  return pct >= 0
}

export type CreativeFormat = 'video' | 'carousel' | 'image'

// Verified live against this account's real ads (not guessed): `video_id` is
// often absent at the top level of the creative — it lives under
// object_story_spec.video_data.video_id instead — and `object_type` is
// almost always 'SHARE' regardless of actual content, so it alone cannot
// distinguish video/image/carousel. This account's multi-asset ads use
// Advantage+ `asset_feed_spec.videos/images` rather than the classic
// `link_data.child_attachments` carousel shape, so both are checked.
export function classifyCreativeFormat(creative: any): CreativeFormat {
  const cr = creative ?? {}
  const hasVideo =
    cr.object_type === 'VIDEO' ||
    !!cr.video_id ||
    !!cr.object_story_spec?.video_data ||
    (Array.isArray(cr.asset_feed_spec?.videos) && cr.asset_feed_spec.videos.length > 0)
  if (hasVideo) return 'video'

  const hasMultipleAssets =
    (Array.isArray(cr.object_story_spec?.link_data?.child_attachments) && cr.object_story_spec.link_data.child_attachments.length > 1) ||
    (Array.isArray(cr.asset_feed_spec?.images) && cr.asset_feed_spec.images.length > 1)
  if (hasMultipleAssets) return 'carousel'

  return 'image'
}

// Ads Manager's Results column labels, keyed by the `indicator` Meta returns
// alongside results/cost_per_result.
const RESULT_LABELS: Record<string, string> = {
  'actions:offsite_conversion.fb_pixel_purchase': 'Purchases',
  'actions:omni_purchase': 'Purchases',
  'actions:purchase': 'Purchases',
  'actions:offsite_conversion.fb_pixel_add_to_cart': 'Adds to cart',
  'actions:offsite_conversion.fb_pixel_initiate_checkout': 'Checkouts',
  'actions:offsite_conversion.fb_pixel_lead': 'Leads',
  'actions:onsite_conversion.lead_grouped': 'Leads',
  'actions:lead': 'Leads',
  'actions:link_click': 'Link clicks',
  'actions:landing_page_view': 'Landing page views',
  'actions:post_engagement': 'Engagements',
  'actions:onsite_conversion.messaging_conversation_started_7d': 'Conversations',
  'video_thruplay_watched_actions': 'ThruPlays',
  'actions:video_view': 'Video views',
  'actions:mobile_app_install': 'App installs',
  reach: 'Reach',
  impressions: 'Impressions',
}

function readResult(arr: any): { indicator: string | null; value: number } {
  const first = Array.isArray(arr) ? arr[0] : null
  if (!first) return { indicator: null, value: 0 }
  return { indicator: first.indicator ?? null, value: safeFloat(first.values?.[0]?.value) }
}

export function resultLabelFor(indicator: string | null): string {
  if (!indicator) return 'Results'
  return RESULT_LABELS[indicator] ?? indicator.replace(/^actions:/, '').replace(/^offsite_conversion\.fb_pixel_/, '').replace(/[._]/g, ' ')
}

export function transformInsightMetrics(ins: any) {
  const spend       = safeFloat(ins?.spend)
  const impressions = safeInt(ins?.impressions)
  const clicks      = safeInt(ins?.clicks)
  const reach       = safeInt(ins?.reach)
  const frequency   = safeFloat(ins?.frequency)
  const ctr         = safeFloat(ins?.ctr)
  const cpm         = safeFloat(ins?.cpm)
  const conversions = getConversions(ins)
  const cpa         = conversions > 0 ? spend / conversions : 0
  const cpc         = clicks > 0 ? spend / clicks : 0

  const roasArr = Array.isArray(ins?.purchase_roas) ? ins.purchase_roas : []
  const roas = roasArr.length
    ? safeFloat(roasArr[0]?.value)
    : spend > 0 ? getConversionValue(ins) / spend : 0

  const funnel = getFunnelCounts(ins)

  // Fall back to purchases when Meta returns no results field (older cached
  // payloads, or rows with no optimization event) so the column is never blank
  // for a sales campaign.
  const r = readResult(ins?.results)
  const resultIndicator = r.indicator ?? (conversions > 0 ? 'actions:offsite_conversion.fb_pixel_purchase' : null)
  const results = r.indicator ? r.value : conversions
  const cpr = readResult(ins?.cost_per_result).value
  const costPerResult = cpr > 0 ? cpr : results > 0 ? spend / results : 0
  const resultLabel = resultLabelFor(resultIndicator)

  return {
    spend, impressions, clicks, reach, frequency, roas, ctr, cpm, cpa, cpc, conversions, funnel,
    results, resultLabel, costPerResult,
  }
}

function summarizeTargeting(targeting: any): string {
  if (!targeting) return ''
  const parts: string[] = []
  const countries = targeting.geo_locations?.countries
  if (Array.isArray(countries) && countries.length) parts.push(countries.join(', '))
  if (targeting.age_min || targeting.age_max) parts.push(`Age ${targeting.age_min ?? 13}-${targeting.age_max ?? 65}`)
  const genderMap: Record<number, string> = { 1: 'Men', 2: 'Women' }
  if (Array.isArray(targeting.genders) && targeting.genders.length === 1) {
    const g = genderMap[targeting.genders[0]]
    if (g) parts.push(g)
  }
  return parts.join(' · ')
}

export type ActionTag = 'scale' | 'watch' | 'optimise'
export function deriveActionTag(roas: number): ActionTag {
  return roas >= 4.5 ? 'scale' : roas >= 3 ? 'watch' : 'optimise'
}

export function transformMetaAd(a: any) {
  try {
    const creative = a.creative ?? {}
    const format = classifyCreativeFormat(creative)
    const metrics = transformInsightMetrics(a.insights)
    return {
      id: a.id ?? Math.random().toString(),
      name: a.name ?? 'Unnamed ad',
      format,
      status: (a.effective_status ?? a.status ?? 'unknown').toLowerCase(),
      thumbnailUrl: creative.thumbnail_url ?? creative.image_url ?? '',
      ...metrics,
      actionTag: deriveActionTag(metrics.roas),
      trend: computeTrend(a.insights, a.previousInsights),
    }
  } catch {
    return null
  }
}

export function transformMetaAdSet(as: any) {
  try {
    const ads = (Array.isArray(as.ads) ? as.ads : [])
      .map(transformMetaAd)
      .filter((a: any): a is NonNullable<ReturnType<typeof transformMetaAd>> => a !== null)
    const metrics = transformInsightMetrics(as.insights)
    return {
      id: as.id ?? Math.random().toString(),
      name: as.name ?? 'Unnamed ad set',
      audience: summarizeTargeting(as.targeting),
      status: (as.effective_status ?? as.status ?? 'unknown').toLowerCase(),
      ...metrics,
      actionTag: deriveActionTag(metrics.roas),
      trend: computeTrend(as.insights, as.previousInsights),
      ads,
      // adCount comes from a separate cheap id-only listing in
      // getCampaignDetail (ads themselves are lazy-loaded per ad set on
      // expand — see AdSetRow) — falls back to ads.length for mock/demo data,
      // which nests ads directly and has no separate count field.
      adCount: typeof as.adCount === 'number' ? as.adCount : ads.length,
    }
  } catch {
    return null
  }
}

export function transformMetaCampaign(c: any) {
  try {
    const dailyBudget = safeFloat(c.daily_budget ?? c.lifetime_budget) / 100
    const adSets = (Array.isArray(c.adsets) ? c.adsets : [])
      .map(transformMetaAdSet)
      .filter((a: any): a is NonNullable<ReturnType<typeof transformMetaAdSet>> => a !== null)
    const metrics = transformInsightMetrics(c.insights)
    const actionTag = deriveActionTag(metrics.roas)
    return {
      id: c.id ?? Math.random().toString(),
      name: c.name ?? 'Unnamed campaign',
      platform: 'meta' as const,
      status: (c.effective_status ?? c.status ?? 'unknown').toLowerCase(),
      type: 'prospecting' as const,
      market: '',           // not available from Meta API
      objective: c.objective ?? '',
      dailyBudget,
      ...metrics,
      actionTag,
      trend: computeTrend(c.insights, c.previousInsights),
      adSets,
    }
  } catch {
    return null
  }
}
