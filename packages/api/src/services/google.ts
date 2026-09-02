import { getPool } from '../lib/db'

const GOOGLE_API_VERSION = 'v25'
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_API_VERSION}`
const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

const CLIENT_ID     = () => process.env.GOOGLE_ADS_CLIENT_ID!
const CLIENT_SECRET = () => process.env.GOOGLE_ADS_CLIENT_SECRET!
const REDIRECT_URI  = () => process.env.GOOGLE_ADS_REDIRECT_URI ?? 'http://localhost:3001/auth/google/callback'
const DEV_TOKEN     = () => process.env.GOOGLE_ADS_DEVELOPER_TOKEN!
const MANAGER_ID    = () => process.env.GOOGLE_ADS_MANAGER_ACCOUNT_ID ?? ''

// ─── In-memory token cache ────────────────────────────────────────────────────

export interface GoogleCustomer {
  id: string           // numeric customer id, e.g. "1234567890"
  name: string
  descriptiveName: string
  currencyCode: string
  isManager: boolean
}

export const googleTokenStore = new Map<string, {
  refreshToken: string
  accessToken: string
  accessTokenExpiry: number   // Unix ms
  customerId: string | null
  customerName: string | null
  customers: GoogleCustomer[]
}>()

// ─── OAuth helpers ────────────────────────────────────────────────────────────

export function getGoogleOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID(),
    redirect_uri: REDIRECT_URI(),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',  // force refresh token on every auth
    state,
  })
  return `${GOOGLE_OAUTH_BASE}?${params}`
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string; refreshToken: string; expiresIn: number
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      redirect_uri: REDIRECT_URI(),
      grant_type: 'authorization_code',
    }),
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`Google token exchange failed (HTTP ${res.status}): ${text.slice(0, 300)}`)
  }
  if (data.error) throw new Error(`Google OAuth error: ${data.error_description ?? data.error}`)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  }
}

export async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string; expiresIn: number
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as any
  if (data.error) throw new Error(`Token refresh failed: ${data.error_description ?? data.error}`)
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 }
}

// Get a valid access token for the given client — refreshes if expired.
export async function getValidAccessToken(clientId: string): Promise<string | null> {
  const cached = googleTokenStore.get(clientId)
  if (!cached) {
    const row = await dbGetGoogleToken(clientId)
    if (!row) return null
    googleTokenStore.set(clientId, {
      refreshToken: row.refreshToken,
      accessToken: row.accessToken ?? '',
      accessTokenExpiry: row.accessTokenExpiry ?? 0,
      customerId: row.customerId,
      customerName: row.customerName,
      customers: row.customers,
    })
  }

  const stored = googleTokenStore.get(clientId)!
  // Refresh if expired or within 2 minutes of expiry
  if (!stored.accessToken || Date.now() >= stored.accessTokenExpiry - 2 * 60 * 1000) {
    const { accessToken, expiresIn } = await refreshGoogleToken(stored.refreshToken)
    const expiry = Date.now() + expiresIn * 1000
    googleTokenStore.set(clientId, { ...stored, accessToken, accessTokenExpiry: expiry })
    await dbUpdateGoogleAccessToken(clientId, accessToken, expiry).catch(() => {})
    return accessToken
  }

  return stored.accessToken
}

// ─── Google Ads REST API ──────────────────────────────────────────────────────

function gadsHeaders(accessToken: string, managerId?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': DEV_TOKEN(),
    'Content-Type': 'application/json',
  }
  // Only set login-customer-id when explicitly provided — defaulting to the
  // MCC causes INVALID_ARGUMENT when the target account is not under that MCC.
  if (managerId) h['login-customer-id'] = managerId.replace(/-/g, '')
  return h
}

export async function listAccessibleCustomers(accessToken: string): Promise<GoogleCustomer[]> {
  // login-customer-id must NOT be sent on this endpoint — it's a global list call
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': DEV_TOKEN(),
    'Content-Type': 'application/json',
  }
  const res = await fetch(`${GOOGLE_ADS_BASE}/customers:listAccessibleCustomers`, { headers })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`listAccessibleCustomers failed (HTTP ${res.status}): ${text.slice(0, 300)}`)
  }
  if (data.error) throw new Error(`listAccessibleCustomers: ${JSON.stringify(data.error)}`)

  const resourceNames: string[] = data.resourceNames ?? []
  if (resourceNames.length === 0) return []

  // Fetch descriptive names for each customer in parallel
  const details = await Promise.allSettled(
    resourceNames.map(async (rn) => {
      const customerId = rn.replace('customers/', '').replace(/-/g, '')
      const r = await fetch(
        `${GOOGLE_ADS_BASE}/customers/${customerId}?readMask=id,descriptive_name,currency_code,manager`,
        { headers: gadsHeaders(accessToken, customerId) }
      )
      const rt = await r.text()
      let d: any
      try { d = JSON.parse(rt) } catch { return null }
      if (d.error) return null
      return {
        id: customerId,
        name: d.descriptiveName ?? customerId,
        descriptiveName: d.descriptiveName ?? customerId,
        currencyCode: d.currencyCode ?? 'INR',
        isManager: d.manager ?? false,
      } as GoogleCustomer
    })
  )
  return details
    .filter((r): r is PromiseFulfilledResult<GoogleCustomer> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
}

// GAQL search — returns all pages
async function gaqlSearch(
  customerId: string,
  accessToken: string,
  query: string,
  managerId?: string
): Promise<any[]> {
  const cid = customerId.replace(/-/g, '')
  const url = `${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:search`
  const headers = gadsHeaders(accessToken, managerId)
  const all: any[] = []
  let pageToken: string | undefined

  do {
    const body: any = { query }
    if (pageToken) body.pageToken = pageToken
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    const raw = await res.text()
    let data: any
    try { data = JSON.parse(raw) } catch { throw new Error(`GAQL non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`) }
    if (data.error) {
      console.error('[GAQL full error]', JSON.stringify(data.error, null, 2))
      throw new Error(`GAQL error: ${JSON.stringify(data.error)}`)
    }
    if (data.results) all.push(...data.results)
    pageToken = data.nextPageToken
  } while (pageToken)

  return all
}

function gaqlDateFilter(dateRange: string): string {
  const map: Record<string, string> = {
    '1D': 'DURING YESTERDAY',
    '7D': 'DURING LAST_7_DAYS',
    '14D': 'DURING LAST_14_DAYS',
    '30D': 'DURING LAST_30_DAYS',
    '3M': 'DURING LAST_90_DAYS',
    '90D': 'DURING LAST_90_DAYS',
    '1Y': 'DURING LAST_365_DAYS',
  }
  if (map[dateRange]) return map[dateRange]
  const days = parseInt(dateRange.replace(/\D/g, ''), 10) || 30
  const until = new Date()
  const since = new Date(until)
  since.setDate(since.getDate() - days)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return `BETWEEN '${fmt(since)}' AND '${fmt(until)}'`
}

function windowToGaqlFilter(window: { since: string; until: string }): string {
  return `BETWEEN '${window.since}' AND '${window.until}'`
}

export async function getGoogleCampaigns(
  customerId: string, accessToken: string, dateRange = '30D', managerId?: string
): Promise<any[]> {
  return getGoogleCampaignsForFilter(customerId, accessToken, gaqlDateFilter(dateRange), managerId)
}

// Same as getGoogleCampaigns but for an explicit {since, until} window — used
// to fetch a "previous period" for trend comparisons.
export async function getGoogleCampaignsForWindow(
  customerId: string, accessToken: string, window: { since: string; until: string }, managerId?: string
): Promise<any[]> {
  return getGoogleCampaignsForFilter(customerId, accessToken, windowToGaqlFilter(window), managerId)
}

async function getGoogleCampaignsForFilter(
  customerId: string, accessToken: string, dateFilter: string, managerId?: string
): Promise<any[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm
    FROM campaign
    WHERE segments.date ${dateFilter}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `
  return gaqlSearch(customerId, accessToken, query.trim(), managerId)
}

// Per-product ad performance from Google Shopping/Performance Max campaigns —
// verified live: `shopping_performance_view` is accessible on this account
// and returns real segments.product_item_id/product_title with genuine
// cost/conversions/revenue (not just clicks/impressions). Item IDs are
// variant-level (one row per size/color), formatted like
// "shopify_in_{productId}_{variantId}" for a Shopify-synced Merchant Center
// feed — parsed out here so callers get one row per product, matching how
// Shopify's own product data is grouped.
export interface GoogleProductRow {
  productId: string        // Shopify numeric product id when parseable, else the raw item id
  productTitle: string
  cost: number
  conversions: number
  conversionsValue: number
  clicks: number
  impressions: number
}

// "shopify_in_8285529800893_46702421115069" -> "8285529800893". Falls back to
// null (caller groups by the raw item id instead) for any other shape, rather
// than guessing — an unmatched item should show as its own line, not be
// silently merged into the wrong product.
export function parseShopifyProductId(itemId: string): string | null {
  const m = /^shopify_[a-z]{2}_(\d+)_\d+$/i.exec(itemId)
  return m ? m[1] : null
}

export async function getGoogleProductPerformance(
  customerId: string, accessToken: string, dateRange = '30D', managerId?: string
): Promise<GoogleProductRow[]> {
  return getGoogleProductPerformanceForFilter(customerId, accessToken, gaqlDateFilter(dateRange), managerId)
}

export async function getGoogleProductPerformanceForWindow(
  customerId: string, accessToken: string, window: { since: string; until: string }, managerId?: string
): Promise<GoogleProductRow[]> {
  return getGoogleProductPerformanceForFilter(customerId, accessToken, windowToGaqlFilter(window), managerId)
}

async function getGoogleProductPerformanceForFilter(
  customerId: string, accessToken: string, dateFilter: string, managerId?: string
): Promise<GoogleProductRow[]> {
  const query = `
    SELECT
      segments.product_item_id,
      segments.product_title,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.clicks,
      metrics.impressions
    FROM shopping_performance_view
    WHERE segments.date ${dateFilter}
  `
  const rows = await gaqlSearch(customerId, accessToken, query.trim(), managerId)

  const byProduct = new Map<string, GoogleProductRow>()
  for (const r of rows) {
    const itemId = r.segments?.productItemId ?? ''
    if (!itemId) continue
    const productId = parseShopifyProductId(itemId) ?? itemId
    const existing = byProduct.get(productId) ?? {
      productId, productTitle: r.segments?.productTitle ?? 'Untitled product',
      cost: 0, conversions: 0, conversionsValue: 0, clicks: 0, impressions: 0,
    }
    existing.cost += (Number(r.metrics?.costMicros) || 0) / 1_000_000
    existing.conversions += Number(r.metrics?.conversions) || 0
    existing.conversionsValue += Number(r.metrics?.conversionsValue) || 0
    existing.clicks += Number(r.metrics?.clicks) || 0
    existing.impressions += Number(r.metrics?.impressions) || 0
    byProduct.set(productId, existing)
  }
  return Array.from(byProduct.values()).sort((a, b) => b.cost - a.cost)
}

export async function getGoogleAdGroups(
  customerId: string, campaignId: string, accessToken: string, dateRange = '30D', managerId?: string
): Promise<any[]> {
  return getGoogleAdGroupsForFilter(customerId, campaignId, accessToken, gaqlDateFilter(dateRange), managerId)
}

export async function getGoogleAdGroupsForWindow(
  customerId: string, campaignId: string, accessToken: string, window: { since: string; until: string }, managerId?: string
): Promise<any[]> {
  return getGoogleAdGroupsForFilter(customerId, campaignId, accessToken, windowToGaqlFilter(window), managerId)
}

async function getGoogleAdGroupsForFilter(
  customerId: string, campaignId: string, accessToken: string, dateFilter: string, managerId?: string
): Promise<any[]> {
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM ad_group
    WHERE campaign.id = ${campaignId}
      AND segments.date ${dateFilter}
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `
  return gaqlSearch(customerId, accessToken, query.trim(), managerId)
}

export async function getGoogleAds(
  customerId: string, adGroupId: string, accessToken: string, dateRange = '30D', managerId?: string
): Promise<any[]> {
  return getGoogleAdsForFilter(customerId, adGroupId, accessToken, gaqlDateFilter(dateRange), managerId)
}

export async function getGoogleAdsForWindow(
  customerId: string, adGroupId: string, accessToken: string, window: { since: string; until: string }, managerId?: string
): Promise<any[]> {
  return getGoogleAdsForFilter(customerId, adGroupId, accessToken, windowToGaqlFilter(window), managerId)
}

async function getGoogleAdsForFilter(
  customerId: string, adGroupId: string, accessToken: string, dateFilter: string, managerId?: string
): Promise<any[]> {
  const query = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr
    FROM ad_group_ad
    WHERE ad_group.id = ${adGroupId}
      AND segments.date ${dateFilter}
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `
  return gaqlSearch(customerId, accessToken, query.trim(), managerId)
}

export async function getGoogleAccountInsights(
  customerId: string, accessToken: string, dateRange = '30D', managerId?: string
): Promise<any> {
  return getGoogleAccountInsightsForFilter(customerId, accessToken, gaqlDateFilter(dateRange), managerId)
}

// Same as getGoogleAccountInsights but for an explicit {since, until} window —
// used for a "previous period" that the relative dateRange presets can't express.
export async function getGoogleAccountInsightsForWindow(
  customerId: string, accessToken: string, window: { since: string; until: string }, managerId?: string
): Promise<any> {
  return getGoogleAccountInsightsForFilter(
    customerId, accessToken, `BETWEEN '${window.since}' AND '${window.until}'`, managerId
  )
}

async function getGoogleAccountInsightsForFilter(
  customerId: string, accessToken: string, dateFilter: string, managerId?: string
): Promise<any> {
  const query = `
    SELECT
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm
    FROM customer
    WHERE segments.date ${dateFilter}
  `
  const rows = await gaqlSearch(customerId, accessToken, query.trim(), managerId)
  // Aggregate all rows into a single account-level summary
  return rows.reduce((acc, row) => {
    const m = row.metrics ?? {}
    return {
      costMicros:        (acc.costMicros        ?? 0) + Number(m.costMicros        ?? 0),
      impressions:       (acc.impressions        ?? 0) + Number(m.impressions       ?? 0),
      clicks:            (acc.clicks             ?? 0) + Number(m.clicks            ?? 0),
      conversions:       (acc.conversions        ?? 0) + Number(m.conversions       ?? 0),
      conversionsValue:  (acc.conversionsValue   ?? 0) + Number(m.conversionsValue  ?? 0),
    }
  }, {} as Record<string, number>)
}

export async function getGoogleDailyInsights(
  customerId: string, accessToken: string, dateRange = '30D', managerId?: string
): Promise<any[]> {
  return getGoogleDailyInsightsForFilter(customerId, accessToken, gaqlDateFilter(dateRange), managerId)
}

// Same as getGoogleDailyInsights but for an explicit {since, until} window —
// used by the reconciliation trend so it shares exact day boundaries with
// computeOverviewMetrics (Google's DURING LAST_N_DAYS keyword uses its own
// "complete days" semantics, which drift slightly from our since/until math).
export async function getGoogleDailyInsightsForWindow(
  customerId: string, accessToken: string, window: { since: string; until: string }, managerId?: string
): Promise<any[]> {
  return getGoogleDailyInsightsForFilter(customerId, accessToken, windowToGaqlFilter(window), managerId)
}

async function getGoogleDailyInsightsForFilter(
  customerId: string, accessToken: string, dateFilter: string, managerId?: string
): Promise<any[]> {
  const query = `
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date ${dateFilter}
    ORDER BY segments.date ASC
  `
  return gaqlSearch(customerId, accessToken, query.trim(), managerId)
}

// ─── DB persistence ───────────────────────────────────────────────────────────

export async function dbSaveGoogleToken(clientId: string, data: {
  refreshToken: string
  accessToken: string
  accessTokenExpiry: number   // Unix ms
  customerId: string | null
  customerName: string | null
  customers: GoogleCustomer[]
}): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO google_tokens
       (client_id, refresh_token, access_token, access_token_expiry, customer_id, customer_name, customers_json, updated_at)
     VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7, NOW())
     ON CONFLICT (client_id) DO UPDATE SET
       refresh_token        = EXCLUDED.refresh_token,
       access_token         = EXCLUDED.access_token,
       access_token_expiry  = EXCLUDED.access_token_expiry,
       customer_id          = EXCLUDED.customer_id,
       customer_name        = EXCLUDED.customer_name,
       customers_json       = EXCLUDED.customers_json,
       updated_at           = NOW()`,
    [
      clientId, data.refreshToken, data.accessToken, data.accessTokenExpiry,
      data.customerId, data.customerName, JSON.stringify(data.customers),
    ]
  )
}

export async function dbUpdateGoogleAccessToken(
  clientId: string, accessToken: string, expiry: number
): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `UPDATE google_tokens
     SET access_token = $2, access_token_expiry = to_timestamp($3 / 1000.0), updated_at = NOW()
     WHERE client_id = $1`,
    [clientId, accessToken, expiry]
  )
}

export async function dbUpdateGoogleCustomer(
  clientId: string, customerId: string, customerName: string
): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `UPDATE google_tokens SET customer_id = $2, customer_name = $3, updated_at = NOW() WHERE client_id = $1`,
    [clientId, customerId, customerName]
  )
}

export async function dbGetGoogleToken(clientId: string): Promise<{
  refreshToken: string
  accessToken: string | null
  accessTokenExpiry: number | null
  customerId: string | null
  customerName: string | null
  customers: GoogleCustomer[]
} | null> {
  const db = getPool()
  if (!db) return null
  const res = await db.query(
    `SELECT refresh_token, access_token,
            extract(epoch from access_token_expiry) * 1000 AS access_token_expiry_ms,
            customer_id, customer_name, customers_json
     FROM google_tokens WHERE client_id = $1`,
    [clientId]
  )
  if (!res.rows.length) return null
  const r = res.rows[0]
  return {
    refreshToken:       r.refresh_token,
    accessToken:        r.access_token ?? null,
    accessTokenExpiry:  r.access_token_expiry_ms ? Number(r.access_token_expiry_ms) : null,
    customerId:         r.customer_id ?? null,
    customerName:       r.customer_name ?? null,
    customers:          r.customers_json ?? [],
  }
}

export async function dbDeleteGoogleToken(clientId: string): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(`DELETE FROM google_tokens WHERE client_id = $1`, [clientId])
}

export async function dbGetAllGoogleSessions(): Promise<Array<{
  clientId: string
  customerId: string | null
  customerName: string | null
  customers: GoogleCustomer[]
}>> {
  const db = getPool()
  if (!db) return []
  const res = await db.query(
    `SELECT client_id, customer_id, customer_name, customers_json
     FROM google_tokens
     ORDER BY updated_at DESC`
  )
  return res.rows.map((r) => ({
    clientId:     r.client_id,
    customerId:   r.customer_id ?? null,
    customerName: r.customer_name ?? null,
    customers:    r.customers_json ?? [],
  }))
}
