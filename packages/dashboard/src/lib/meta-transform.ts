export const safeFloat = (v: any) => { const n = parseFloat(v ?? '0'); return isFinite(n) ? n : 0 }
export const safeInt   = (v: any) => { const n = parseInt(v ?? '0', 10); return isFinite(n) ? n : 0 }

const PURCHASE_ACTION_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']

function getConversions(ins: any): number {
  const actions = Array.isArray(ins?.actions) ? ins.actions : []
  return actions
    .filter((a: any) => PURCHASE_ACTION_TYPES.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + safeInt(a.value), 0)
}

function getConversionValue(ins: any): number {
  const values = Array.isArray(ins?.action_values) ? ins.action_values : []
  return values
    .filter((a: any) => PURCHASE_ACTION_TYPES.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + safeFloat(a.value), 0)
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

  return { spend, impressions, clicks, reach, frequency, roas, ctr, cpm, cpa, cpc, conversions }
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

function deriveActionTag(roas: number): string {
  return roas >= 4.5 ? 'scale' : roas >= 3 ? 'watch' : 'optimise'
}

export function transformMetaAd(a: any) {
  try {
    const creative = a.creative ?? {}
    const format = creative.video_id ? 'video' : creative.object_type === 'SHARE' ? 'carousel' : 'image'
    const metrics = transformInsightMetrics(a.insights)
    return {
      id: a.id ?? Math.random().toString(),
      name: a.name ?? 'Unnamed ad',
      format,
      status: (a.effective_status ?? a.status ?? 'unknown').toLowerCase(),
      thumbnailUrl: creative.thumbnail_url ?? creative.image_url ?? '',
      ...metrics,
      actionTag: deriveActionTag(metrics.roas),
      trend: 0,
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
      trend: 0,
      ads,
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
      trend: 0,
      adSets,
    }
  } catch {
    return null
  }
}
