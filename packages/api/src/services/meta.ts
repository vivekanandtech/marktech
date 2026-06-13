// Meta Marketing API service
// All calls go through here — swap mock data for real data per client

const GRAPH = 'https://graph.facebook.com/v20.0'
const APP_ID = process.env.META_APP_ID!
const APP_SECRET = process.env.META_APP_SECRET!
const REDIRECT_URI = process.env.META_REDIRECT_URI!

// ─── Token store (in-memory for dev, replace with DB query in production) ────
// Key: clientId, Value: { accessToken, adAccountIds, expiresAt }
export const tokenStore = new Map<string, {
  accessToken: string
  adAccountIds: string[]
  metaUserId: string
  expiresAt: number
}>()

// ─── OAuth helpers ────────────────────────────────────────────────────────────

export function getOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'ads_read',
    response_type: 'code',
    state,
  })
  return `https://www.facebook.com/v20.0/dialog/oauth?${params}`
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: APP_ID,
    client_secret: APP_SECRET,
    redirect_uri: REDIRECT_URI,
    code,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${params}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.access_token
}

export async function extendToLongLivedToken(shortToken: string): Promise<{ token: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: shortToken,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${params}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return { token: data.access_token, expiresIn: data.expires_in ?? 5184000 }
}

export async function getMetaUserId(token: string): Promise<string> {
  const res = await fetch(`${GRAPH}/me?fields=id&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.id
}

export async function getAdAccounts(token: string): Promise<{
  id: string
  name: string
  currency: string
  status: number
  business?: { id: string; name: string } | null
}[]> {
  // Note: `business{id,name}` requires the `business_management` permission,
  // which this app does not request (ads_read is sufficient) — omit it.
  const res = await fetch(`${GRAPH}/me/adaccounts?fields=id,name,currency,account_status&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

// ─── Campaign data ────────────────────────────────────────────────────────────

export async function getCampaigns(adAccountId: string, token: string) {
  const fields = 'id,name,status,objective,daily_budget,lifetime_budget,effective_status'
  const res = await fetch(`${GRAPH}/${adAccountId}/campaigns?fields=${fields}&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

// Rolling-window lengths for each UI date range option. Meta's `date_preset`
// values don't cover arbitrary ranges like "last 3 months", so we always
// compute an explicit `time_range` instead.
const DAYS_MAP: Record<string, number> = {
  '1D': 1, '3D': 3, '7D': 7, '14D': 14, '30D': 30, '3M': 90, '6M': 180, '1Y': 365,
}

function toTimeRange(dateRange: string): { since: string; until: string } {
  const days = DAYS_MAP[dateRange] ?? 30
  const until = new Date()
  const since = new Date(until)
  since.setDate(since.getDate() - (days - 1))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { since: fmt(since), until: fmt(until) }
}

const BASE_INSIGHT_FIELDS = [
  'spend', 'impressions', 'clicks', 'reach', 'frequency',
  'purchase_roas', 'cost_per_action_type',
  'cpm', 'ctr', 'cpp', 'actions', 'action_values',
]

// Only request the id/name fields for the level being queried. Requesting
// e.g. ad_id/ad_name at level=campaign makes Meta return one row per ad
// (each with only that ad's slice of spend) instead of one aggregated row
// per campaign, which broke the campaign_id-keyed insight lookup.
const LEVEL_FIELDS: Record<string, string[]> = {
  campaign: ['campaign_id', 'campaign_name', ...BASE_INSIGHT_FIELDS],
  adset: ['adset_id', 'adset_name', 'campaign_id', 'campaign_name', ...BASE_INSIGHT_FIELDS],
  ad: ['ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', ...BASE_INSIGHT_FIELDS],
}

export async function getCampaignInsights(
  adAccountId: string,
  token: string,
  dateRange = '30D',
  level = 'campaign'
) {
  const fields = (LEVEL_FIELDS[level] ?? LEVEL_FIELDS.campaign).join(',')

  const params = new URLSearchParams({
    fields,
    time_range: JSON.stringify(toTimeRange(dateRange)),
    level,
    access_token: token,
  })

  const res = await fetch(`${GRAPH}/${adAccountId}/insights?${params}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

export async function getAdSets(adAccountId: string, token: string, campaignId?: string) {
  const fields = 'id,name,campaign_id,status,daily_budget,targeting,effective_status'
  const filter = campaignId ? `&campaign_id=${campaignId}` : ''
  const res = await fetch(`${GRAPH}/${adAccountId}/adsets?fields=${fields}${filter}&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

export async function getAds(adAccountId: string, token: string) {
  const fields = 'id,name,status,adset_id,campaign_id,effective_status,creative{id,title,body,thumbnail_url,image_url,video_id,object_type}'
  const res = await fetch(`${GRAPH}/${adAccountId}/ads?fields=${fields}&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

// ─── Verify a token is still valid ───────────────────────────────────────────

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const appToken = `${APP_ID}|${APP_SECRET}`
    const res = await fetch(`${GRAPH}/debug_token?input_token=${token}&access_token=${appToken}`)
    const data = await res.json() as any
    return data.data?.is_valid === true
  } catch {
    return false
  }
}
