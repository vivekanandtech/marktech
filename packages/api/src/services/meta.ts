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
  adAccounts?: any[]        // full objects: { id, name, currency }
  expiresAt: number         // Unix ms
}): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO meta_tokens
       (client_id, access_token, meta_user_id, ad_account_ids, ad_accounts_json, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6), NOW())
     ON CONFLICT (client_id) DO UPDATE SET
       access_token     = EXCLUDED.access_token,
       meta_user_id     = EXCLUDED.meta_user_id,
       ad_account_ids   = EXCLUDED.ad_account_ids,
       ad_accounts_json = EXCLUDED.ad_accounts_json,
       expires_at       = EXCLUDED.expires_at,
       updated_at       = NOW()`,
    [
      clientId,
      data.accessToken,
      data.metaUserId,
      data.adAccountIds,
      data.adAccounts ? JSON.stringify(data.adAccounts) : null,
      data.expiresAt / 1000,
    ]
  )
}

export async function dbUpdateSelectedAccount(clientId: string, adAccountId: string): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `UPDATE meta_tokens SET selected_ad_account_id = $2, updated_at = NOW() WHERE client_id = $1`,
    [clientId, adAccountId]
  )
}

export async function dbGetToken(clientId: string): Promise<{
  accessToken: string
  metaUserId: string
  adAccountIds: string[]
  adAccounts: any[]
  selectedAdAccountId: string | null
  expiresAt: number
} | null> {
  const db = getPool()
  if (!db) return null
  const result = await db.query(
    `SELECT access_token, meta_user_id, ad_account_ids, ad_accounts_json,
            selected_ad_account_id,
            extract(epoch from expires_at) * 1000 AS expires_ms
     FROM meta_tokens
     WHERE client_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
    [clientId]
  )
  if (!result.rows[0]) return null
  const row = result.rows[0]
  return {
    accessToken:           row.access_token,
    metaUserId:            row.meta_user_id,
    adAccountIds:          row.ad_account_ids ?? [],
    adAccounts:            row.ad_accounts_json ?? [],
    selectedAdAccountId:   row.selected_ad_account_id ?? null,
    expiresAt:             Number(row.expires_ms),
  }
}

export async function dbGetAllSessions(): Promise<Array<{
  clientId: string
  metaUserId: string
  adAccounts: any[]
  adAccountIds: string[]
  selectedAdAccountId: string | null
  accessToken: string
  expiresAt: number
}>> {
  const db = getPool()
  if (!db) return []
  const result = await db.query(
    `SELECT client_id, meta_user_id, ad_accounts_json, ad_account_ids,
            selected_ad_account_id, access_token,
            extract(epoch from expires_at) * 1000 AS expires_ms
     FROM meta_tokens
     WHERE expires_at IS NULL OR expires_at > NOW()
     ORDER BY updated_at DESC`
  )
  return result.rows.map((row) => ({
    clientId:             row.client_id,
    metaUserId:           row.meta_user_id,
    adAccounts:           row.ad_accounts_json ?? [],
    adAccountIds:         row.ad_account_ids ?? [],
    selectedAdAccountId:  row.selected_ad_account_id ?? null,
    accessToken:          row.access_token,
    expiresAt:            Number(row.expires_ms),
  }))
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
  // Don't embed creative{} in the ads fetch — it triggers Meta's "reduce data"
  // error on campaigns with many ads. Creative thumbnails are cosmetic; losing
  // them is better than the whole expansion failing.
  const adsetFields = 'id,name,campaign_id,status,daily_budget,targeting,effective_status'
  const adFields    = 'id,name,status,adset_id,campaign_id,effective_status'
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

  // Each request is guarded individually — one throttled/failed call should not
  // wipe the entire expansion for the other levels.
  const safe = async (fn: () => Promise<any[]>): Promise<any[]> => {
    try { return await fn() } catch { return [] }
  }

  const [adsets, adsetInsights, ads, adInsights] = await Promise.all([
    safe(() => fetchAllPages(`${GRAPH}/${campaignId}/adsets?fields=${adsetFields}&limit=200&access_token=${token}`)),
    safe(() => fetchAllPages(`${GRAPH}/${campaignId}/insights?${adsetInsightParams}`)),
    safe(() => fetchAllPages(`${GRAPH}/${campaignId}/ads?fields=${adFields}&limit=200&access_token=${token}`)),
    safe(() => fetchAllPages(`${GRAPH}/${campaignId}/insights?${adInsightParams}`)),
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

// Pick the highest-quality image URL available in a creative object.
// Priority:
//   1. adimages permalink (full-res, fetched separately via image_hash)
//   2. object_story_spec.link_data.picture (good quality for link/image ads)
//   3. object_story_spec.video_data.image_url (video ad custom thumbnail)
//   4. object_story_spec.photo_data.images (photo ads)
//   5. image_url / thumbnail_url (low-res fallbacks)
function pickBestImage(cr: any, hashUrlMap: Record<string, string> = {}): string {
  if (cr.image_hash && hashUrlMap[cr.image_hash]) return hashUrlMap[cr.image_hash]

  const ldPicture = cr.object_story_spec?.link_data?.picture
  if (ldPicture) return ldPicture

  const vdImage = cr.object_story_spec?.video_data?.image_url
  if (vdImage) return vdImage

  const pdImages = cr.object_story_spec?.photo_data?.images
  if (pdImages && typeof pdImages === 'object') {
    const preferred = pdImages['standard'] ?? pdImages['maximum'] ?? Object.values(pdImages)[0] as any
    if (preferred?.url) return preferred.url
  }

  return cr.image_url ?? cr.thumbnail_url ?? ''
}

// Build a clickable preview URL for the ad.
// effective_object_story_id is a {page_id}_{post_id} string that maps to
// a real Facebook post the user can view without needing Ads Manager access.
function buildPreviewUrl(cr: any): string {
  const storyId = cr.effective_object_story_id
  if (storyId) return `https://www.facebook.com/${storyId}`
  const link = cr.object_story_spec?.link_data?.link
  if (link) return link
  return ''
}

// Top ads for the Creatives page — 2-step approach to avoid Meta's
// "reduce the amount of data" error from embedding insights in the ads query:
// 1. Fetch ad-level insights from the dedicated insights endpoint (lightweight).
// 2. Batch-fetch creative details only for the top N ad IDs.
export async function getTopAds(adAccountId: string, token: string, limit = 25): Promise<any[]> {
  const safeLimit = Math.min(limit, 25)   // hard cap — >25 in one batch triggers Meta's data limit
  const { since, until } = toTimeRange('30D')
  const insightFields = [
    'ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'reach',
    'purchase_roas', 'ctr', 'cpm', 'frequency', 'actions', 'action_values',
  ].join(',')

  // Step 1 — fetch a modest page of ad insights, sort by spend, take top N.
  // Keeping the fetch size at 3× the final limit avoids Meta's data-reduction
  // error while still giving us enough rows to find the top spenders.
  const insightParams = new URLSearchParams({
    fields: insightFields,
    time_range: JSON.stringify({ since, until }),
    level: 'ad',
    limit: String(Math.min(safeLimit * 3, 75)),
    access_token: token,
  })
  const insRes = await fetch(`${GRAPH}/${adAccountId}/insights?${insightParams}`)
  const insData = await insRes.json() as any
  if (insData.error) throw new Error(insData.error.message)
  const topInsights = ((insData.data ?? []) as any[])
    .sort((a, b) => parseFloat(b.spend ?? '0') - parseFloat(a.spend ?? '0'))
    .slice(0, safeLimit)

  if (topInsights.length === 0) return []

  // Step 2 — batch creative details in chunks of 10.
  // We request image_hash + object_story_spec (including video_data) so we can
  // resolve full-resolution images in step 3.
  const CHUNK = 10
  const adDataMap: Record<string, any> = {}
  for (let i = 0; i < topInsights.length; i += CHUNK) {
    const chunk = topInsights.slice(i, i + CHUNK)
    const creativeFields = [
      'id', 'thumbnail_url', 'image_url', 'image_hash', 'video_id', 'object_type',
      'effective_object_story_id',
      'object_story_spec{link_data{picture,link},photo_data{images},video_data{image_url}}',
    ].join(',')
    const adParams = new URLSearchParams({
      ids: chunk.map((ins: any) => ins.ad_id).join(','),
      fields: `id,name,status,effective_status,creative{${creativeFields}}`,
      access_token: token,
    })
    const adRes = await fetch(`${GRAPH}/?${adParams}`)
    const adChunk = await adRes.json() as any
    if (!adChunk.error) Object.assign(adDataMap, adChunk)
  }

  // Step 3 — bulk-resolve image_hash → full-res permalink via the adimages endpoint.
  // This gives the original-upload resolution for any image-based creative (typically
  // 1200×628 or higher), much sharper than thumbnail_url or link_data.picture.
  const hashUrlMap: Record<string, string> = {}
  const hashes = Object.values(adDataMap)
    .map((ad: any) => ad.creative?.image_hash)
    .filter(Boolean) as string[]

  if (hashes.length > 0) {
    try {
      const imgParams = new URLSearchParams({
        hashes: hashes.join(','),
        fields: 'hash,permalink_url',
        access_token: token,
      })
      const imgRes = await fetch(`${GRAPH}/${adAccountId}/adimages?${imgParams}`)
      const imgData = await imgRes.json() as any
      if (!imgData.error && Array.isArray(imgData.data)) {
        for (const img of imgData.data) {
          if (img.hash && img.permalink_url) hashUrlMap[img.hash] = img.permalink_url
        }
      }
    } catch { /* non-fatal — will fall back to lower-res sources */ }
  }

  return topInsights.map((ins: any) => {
    const ad = adDataMap[ins.ad_id] ?? {}
    const cr = ad.creative ?? {}
    const imageUrl   = pickBestImage(cr, hashUrlMap)
    const previewUrl = buildPreviewUrl(cr)
    return {
      id: ins.ad_id,
      name: ins.ad_name,
      status: ad.status ?? 'unknown',
      effective_status: ad.effective_status ?? 'unknown',
      creative: { ...cr, _imageUrl: imageUrl, _previewUrl: previewUrl },
      insights: { data: [ins] },
    }
  })
}

// Daily time-series insights — used by the Overview charts.
// Returns one row per day with spend, purchase value, ROAS, CTR, and
// conversion count so the frontend can draw Spend, ROAS, and CVR charts.
export async function getDailyInsights(adAccountId: string, token: string, dateRange = '30D') {
  const fields = [
    'date_start', 'spend', 'impressions', 'clicks', 'reach',
    'purchase_roas', 'ctr', 'actions', 'action_values',
  ].join(',')
  const params = new URLSearchParams({
    fields,
    time_range: JSON.stringify(toTimeRange(dateRange)),
    level: 'account',
    time_increment: '1',
    access_token: token,
  })
  return fetchAllPages(`${GRAPH}/${adAccountId}/insights?${params}`)
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
