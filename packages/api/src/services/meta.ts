import { getPool } from '../lib/db'

const GRAPH = 'https://graph.facebook.com/v20.0'
const APP_ID = process.env.META_APP_ID!
const APP_SECRET = process.env.META_APP_SECRET!
const REDIRECT_URI = process.env.META_REDIRECT_URI!

// ─── In-memory token store (fast path — populated on OAuth and on DB reads) ───
export const tokenStore = new Map<string, {
  accessToken: string
  adAccountIds: string[]
  metaUserId: string
  expiresAt: number
}>()

// ─── DB-backed token persistence ─────────────────────────────────────────────

export async function dbSaveToken(clientId: string, data: {
  accessToken: string
  metaUserId: string
  adAccountIds: string[]
  expiresAt: number  // Unix ms
}): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO meta_tokens (client_id, access_token, meta_user_id, ad_account_ids, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, to_timestamp($5), NOW())
     ON CONFLICT (client_id) DO UPDATE SET
       access_token   = EXCLUDED.access_token,
       meta_user_id   = EXCLUDED.meta_user_id,
       ad_account_ids = EXCLUDED.ad_account_ids,
       expires_at     = EXCLUDED.expires_at,
       updated_at     = NOW()`,
    [clientId, data.accessToken, data.metaUserId, data.adAccountIds, data.expiresAt / 1000]
  )
}

export async function dbGetToken(clientId: string): Promise<{
  accessToken: string
  metaUserId: string
  adAccountIds: string[]
  expiresAt: number
} | null> {
  const db = getPool()
  if (!db) return null
  const result = await db.query(
    `SELECT access_token, meta_user_id, ad_account_ids, extract(epoch from expires_at) * 1000 AS expires_ms
     FROM meta_tokens
     WHERE client_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
    [clientId]
  )
  if (!result.rows[0]) return null
  const row = result.rows[0]
  return {
    accessToken:   row.access_token,
    metaUserId:    row.meta_user_id,
    adAccountIds:  row.ad_account_ids ?? [],
    expiresAt:     Number(row.expires_ms),
  }
}

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

export const BASE_INSIGHT_FIELDS = [
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
  adset:    ['adset_id', 'adset_name', 'campaign_id', 'campaign_name', ...BASE_INSIGHT_FIELDS],
  ad:       ['ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', ...BASE_INSIGHT_FIELDS],
}

// Follow Meta's cursor-based pagination until all rows are fetched.
async function fetchAllPages(url: string): Promise<any[]> {
  const all: any[] = []
  let next: string | null = url
  while (next) {
    const res = await fetch(next)
    const data = await res.json() as any
    if (data.error) throw new Error(data.error.message)
    all.push(...(data.data ?? []))
    next = data.paging?.next ?? null
  }
  return all
}

export async function getCampaigns(adAccountId: string, token: string) {
  const fields = 'id,name,status,objective,daily_budget,lifetime_budget,effective_status'
  return fetchAllPages(`${GRAPH}/${adAccountId}/campaigns?fields=${fields}&limit=200&access_token=${token}`)
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
    limit: '200',
    access_token: token,
  })
  return fetchAllPages(`${GRAPH}/${adAccountId}/insights?${params}`)
}

// Single account-level insight row — gives true account totals matching what
// Meta Ads Manager shows, regardless of how many campaigns the account has.
export async function getAccountInsights(adAccountId: string, token: string, dateRange = '30D') {
  const params = new URLSearchParams({
    fields: BASE_INSIGHT_FIELDS.join(','),
    time_range: JSON.stringify(toTimeRange(dateRange)),
    level: 'account',
    access_token: token,
  })
  const res = await fetch(`${GRAPH}/${adAccountId}/insights?${params}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return (data.data ?? [])[0] ?? null
}

// Fetch a single campaign's ad sets, ads, and their insights.
// Uses the /{campaignId}/ edge so queries are scoped to that one campaign
// — no global pagination problem regardless of account size.
export async function getCampaignDetail(
  campaignId: string,
  token: string,
  dateRange = '30D'
): Promise<any[]> {
  const adsetFields = 'id,name,campaign_id,status,daily_budget,targeting,effective_status'
  const adFields    = 'id,name,status,adset_id,campaign_id,effective_status,creative{id,title,body,thumbnail_url,image_url,video_id,object_type}'
  const insightTime = JSON.stringify(toTimeRange(dateRange))

  const adsetInsightParams = new URLSearchParams({
    fields: LEVEL_FIELDS.adset.join(','),
    time_range: insightTime,
    level: 'adset',
    limit: '200',
    access_token: token,
  })
  const adInsightParams = new URLSearchParams({
    fields: LEVEL_FIELDS.ad.join(','),
    time_range: insightTime,
    level: 'ad',
    limit: '200',
    access_token: token,
  })

  const [adsets, adsetInsights, ads, adInsights] = await Promise.all([
    fetchAllPages(`${GRAPH}/${campaignId}/adsets?fields=${adsetFields}&limit=200&access_token=${token}`),
    fetchAllPages(`${GRAPH}/${campaignId}/insights?${adsetInsightParams}`),
    fetchAllPages(`${GRAPH}/${campaignId}/ads?fields=${adFields}&limit=200&access_token=${token}`),
    fetchAllPages(`${GRAPH}/${campaignId}/insights?${adInsightParams}`),
  ])

  const adsetInsightMap = new Map(adsetInsights.map((i: any) => [i.adset_id, i]))
  const adInsightMap    = new Map(adInsights.map((i: any) => [i.ad_id, i]))

  const adsByAdset = new Map<string, any[]>()
  for (const ad of ads) {
    const list = adsByAdset.get(ad.adset_id) ?? []
    list.push({ ...ad, insights: adInsightMap.get(ad.id) ?? null })
    adsByAdset.set(ad.adset_id, list)
  }

  return adsets.map((as: any) => ({
    ...as,
    insights: adsetInsightMap.get(as.id) ?? null,
    ads: adsByAdset.get(as.id) ?? [],
  }))
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
