import { getPool } from '../lib/db'

const SHOPIFY_API_VERSION = '2026-07'

// ─── In-memory token cache ────────────────────────────────────────────────────
export const shopifyTokenStore = new Map<string, {
  shopDomain: string
  accessToken: string
  shopName: string
  scope: string
  expiresAt?: string  // ISO string; set for client_credentials tokens (24h expiry)
}>()

// ─── OAuth helpers ────────────────────────────────────────────────────────────

export function normalizeShopDomain(shop: string): string {
  const s = shop.toLowerCase().trim().replace(/https?:\/\//, '').replace(/\/.*/, '')
  return s.includes('.myshopify.com') ? s : `${s}.myshopify.com`
}

export function getShopifyOAuthUrl(shopDomain: string, clientId: string): string {
  const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!
  const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI ?? 'http://localhost:3001/auth/shopify/callback'
  const normalized = normalizeShopDomain(shopDomain)
  const scopes = 'read_analytics,read_orders,read_products,read_reports,read_customers'
  return `https://${normalized}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}&state=${encodeURIComponent(clientId)}`
}

// Client credentials grant — Dev Dashboard apps only (app + store must be same Shopify org)
// Returns a 24-hour access token; no OAuth redirect needed.
export async function getClientCredentialsToken(shopDomain: string): Promise<{
  accessToken: string; scope: string; expiresAt: string
}> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SHOPIFY_CLIENT_ID!,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET!,
  })
  const resp = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!resp.ok) {
    const text = await resp.text()
    // Shopify returns "Oauth error shop_not_permitted" if app/store aren't in same org
    throw new Error(`Client credentials exchange failed (${resp.status}): ${text.slice(0, 300)}`)
  }
  const data = await resp.json() as { access_token: string; scope: string; expires_in: number }
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString()
  return { accessToken: data.access_token, scope: data.scope, expiresAt }
}

export async function exchangeShopifyCode(shopDomain: string, code: string): Promise<{ accessToken: string; scope: string }> {
  const resp = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Shopify token exchange failed (${resp.status}): ${text}`)
  }
  const data = await resp.json() as { access_token: string; scope: string }
  return { accessToken: data.access_token, scope: data.scope }
}

export async function getShopInfo(shopDomain: string, accessToken: string): Promise<{ name: string }> {
  const resp = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  })
  if (!resp.ok) throw new Error(`Failed to fetch shop info (${resp.status})`)
  const data = await resp.json() as { shop: { name: string } }
  return { name: data.shop.name }
}

// ─── ShopifyQL via GraphQL Admin API ─────────────────────────────────────────

export interface ShopifyQLResult {
  columns: Array<{ name: string; dataType: string; displayName: string }>
  rows: string[][]
}

// Shopify's `tableData.rows` returns objects keyed by column name, not arrays —
// reshape into arrays ordered by `columns` to match this module's table contract.
// Extracted as a pure function since this exact shape mismatch has broken before
// (Shopify changed it from an array under the old TableResponse union schema).
export function reshapeShopifyQLRows(
  columns: Array<{ name: string }>,
  rawRows: Array<Record<string, string>>
): string[][] {
  return rawRows.map((row) => columns.map((col) => row[col.name] ?? ''))
}

export async function runShopifyQL(
  shopDomain: string,
  accessToken: string,
  sqlQuery: string
): Promise<ShopifyQLResult> {
  const gql = `{
    shopifyqlQuery(query: ${JSON.stringify(sqlQuery)}) {
      parseErrors
      tableData {
        rows
        columns { name dataType displayName }
      }
    }
  }`

  const resp = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: gql }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Shopify GraphQL request failed (${resp.status}): ${text.slice(0, 200)}`)
  }

  const json = await resp.json() as any

  if (json.errors?.length) {
    throw new Error(`Shopify API error: ${json.errors[0]?.message}`)
  }

  const result = json.data?.shopifyqlQuery
  if (!result) throw new Error('Empty ShopifyQL response')

  if (result.parseErrors?.length) {
    throw new Error(`ShopifyQL syntax error: ${result.parseErrors[0]}`)
  }

  const td = result.tableData
  if (!td) throw new Error('ShopifyQL returned no table data (analytics scope may be missing)')

  const columns = td.columns ?? []
  const rows = reshapeShopifyQLRows(columns, td.rows ?? [])

  return { columns, rows }
}

// ─── Cross-channel attribution ───────────────────────────────────────────────
// Classification is a judgment call, not a Shopify-provided label: Meta ads in
// this account tag utm_medium with campaign details, while organic Instagram/
// Facebook clicks leave utm_medium empty — so "has a medium" is what separates
// paid from organic within the same referring_channel bucket. Google Ads is
// identified by utm_medium=cpc rather than by channel/source alone, since
// organic Google search shares the same "google" referring_channel.

export type AttributionChannel = 'meta' | 'google' | 'direct' | 'organic' | 'other'

export interface ChannelTotals {
  orders: number
  netSales: number
}

export function classifyChannel(referringChannel: string, utmMedium: string, utmSource: string): AttributionChannel {
  const rc = referringChannel.toLowerCase()
  const medium = utmMedium.toLowerCase()
  const source = utmSource.toLowerCase()
  const hasMedium = medium.length > 0

  if (hasMedium && (['facebook', 'instagram', 'c2c'].includes(rc) || source === 'facebook')) return 'meta'
  if (medium === 'cpc' && (source === 'google' || rc === 'google')) return 'google'
  if (rc === 'direct') return 'direct'
  if (!hasMedium && ['google', 'bing', 'yahoo!', 'duckduckgo'].includes(rc)) return 'organic'
  return 'other'
}

export async function getOrdersByChannel(
  shopDomain: string,
  accessToken: string,
  days: number
): Promise<Record<AttributionChannel, ChannelTotals>> {
  const query =
    `FROM sales SHOW orders, total_sales ` +
    `GROUP BY referring_channel, utm_medium, utm_source WITH LAST_CLICK_ATTRIBUTION ` +
    `SINCE -${days}d UNTIL today`

  const { columns, rows } = await runShopifyQL(shopDomain, accessToken, query)
  const rcIdx = columns.findIndex((c) => c.name === 'referring_channel')
  const medIdx = columns.findIndex((c) => c.name === 'utm_medium')
  const srcIdx = columns.findIndex((c) => c.name === 'utm_source')
  const ordersIdx = columns.findIndex((c) => c.name === 'orders__last_click')
  const salesIdx = columns.findIndex((c) => c.name === 'total_sales__last_click')

  const totals: Record<AttributionChannel, ChannelTotals> = {
    meta: { orders: 0, netSales: 0 },
    google: { orders: 0, netSales: 0 },
    direct: { orders: 0, netSales: 0 },
    organic: { orders: 0, netSales: 0 },
    other: { orders: 0, netSales: 0 },
  }

  for (const row of rows) {
    const channel = classifyChannel(row[rcIdx] ?? '', row[medIdx] ?? '', row[srcIdx] ?? '')
    totals[channel].orders += Number(row[ordersIdx]) || 0
    totals[channel].netSales += Number(row[salesIdx]) || 0
  }

  return totals
}

export async function getMetaSessions(shopDomain: string, accessToken: string, days: number): Promise<number> {
  const query =
    `FROM sessions SHOW sessions ` +
    `GROUP BY utm_source, referrer_name ` +
    `SINCE -${days}d UNTIL today`

  const { columns, rows } = await runShopifyQL(shopDomain, accessToken, query)
  const srcIdx = columns.findIndex((c) => c.name === 'utm_source')
  const refIdx = columns.findIndex((c) => c.name === 'referrer_name')
  const sessIdx = columns.findIndex((c) => c.name === 'sessions')

  let total = 0
  for (const row of rows) {
    const source = (row[srcIdx] ?? '').toLowerCase()
    const referrer = (row[refIdx] ?? '').toLowerCase()
    if (source === 'facebook' || referrer === 'instagram' || referrer === 'facebook') {
      total += Number(row[sessIdx]) || 0
    }
  }
  return total
}

export async function getNetRevenueByDay(shopDomain: string, accessToken: string, days: number): Promise<ShopifyQLResult> {
  const query =
    `FROM sales SHOW net_sales ` +
    `GROUP BY day ` +
    `TIMESERIES day ` +
    `SINCE -${days}d UNTIL today`
  return runShopifyQL(shopDomain, accessToken, query)
}

export async function getSalesByCountry(shopDomain: string, accessToken: string, days: number): Promise<ShopifyQLResult> {
  const query =
    `FROM sales SHOW orders, net_sales ` +
    `GROUP BY billing_country ` +
    `SINCE -${days}d UNTIL today ` +
    `ORDER BY net_sales DESC`
  return runShopifyQL(shopDomain, accessToken, query)
}

// In-memory cache — the country list rarely changes, no need to hit Shopify on every dropdown open.
const countryCache = new Map<string, { countries: string[]; fetchedAt: number }>()
const COUNTRY_CACHE_TTL_MS = 60 * 60 * 1000

export async function getAvailableCountries(shopDomain: string, accessToken: string): Promise<string[]> {
  const cached = countryCache.get(shopDomain)
  if (cached && Date.now() - cached.fetchedAt < COUNTRY_CACHE_TTL_MS) return cached.countries

  const query = `FROM sales SHOW orders GROUP BY billing_country SINCE -90d UNTIL today ORDER BY orders DESC`
  const { columns, rows } = await runShopifyQL(shopDomain, accessToken, query)
  const idx = columns.findIndex((c) => c.name === 'billing_country')
  const countries = rows.map((r) => r[idx]).filter((c): c is string => !!c)

  countryCache.set(shopDomain, { countries, fetchedAt: Date.now() })
  return countries
}

// New-customer count isn't exposed as a ShopifyQL dimension (verified: customer_type,
// customer_status, is_first_order all don't exist on the sales table) — the reliable
// mechanism is the standard Orders API's customer.numberOfOrders field. Paginated and
// capped for cost control; large stores get an approximate count over the sampled orders.
const NEW_CUSTOMER_SAMPLE_CAP = 500

export async function getNewCustomerCount(
  shopDomain: string,
  accessToken: string,
  days: number
): Promise<{ newCustomers: number; sampledOrders: number; approximate: boolean }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const gql = `
    query($cursor: String) {
      orders(first: 250, after: $cursor, query: "created_at:>=${since}") {
        pageInfo { hasNextPage endCursor }
        edges { node { customer { numberOfOrders } } }
      }
    }`

  let cursor: string | null = null
  let newCustomers = 0
  let sampledOrders = 0
  let hasNextPage = true

  while (hasNextPage && sampledOrders < NEW_CUSTOMER_SAMPLE_CAP) {
    const resp: Response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { cursor } }),
    })
    if (!resp.ok) throw new Error(`Shopify orders request failed (${resp.status})`)
    const json = await resp.json() as any
    if (json.errors?.length) throw new Error(`Shopify API error: ${json.errors[0]?.message}`)

    const edges = json.data?.orders?.edges ?? []
    for (const { node } of edges) {
      sampledOrders++
      if (node.customer?.numberOfOrders === 1) newCustomers++
    }
    hasNextPage = json.data?.orders?.pageInfo?.hasNextPage ?? false
    cursor = json.data?.orders?.pageInfo?.endCursor ?? null
  }

  return { newCustomers, sampledOrders, approximate: hasNextPage }
}

// ─── DB persistence ───────────────────────────────────────────────────────────

export async function dbSaveShopifyToken(clientId: string, data: {
  shopDomain: string; accessToken: string; shopName: string; scope: string; expiresAt?: string
}): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO shopify_tokens (client_id, shop_domain, access_token, shop_name, scope, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (client_id) DO UPDATE SET
       shop_domain  = EXCLUDED.shop_domain,
       access_token = EXCLUDED.access_token,
       shop_name    = EXCLUDED.shop_name,
       scope        = EXCLUDED.scope,
       expires_at   = EXCLUDED.expires_at,
       updated_at   = NOW()`,
    [clientId, data.shopDomain, data.accessToken, data.shopName, data.scope, data.expiresAt ?? null]
  )
}

export async function dbGetShopifyToken(clientId: string): Promise<{
  shopDomain: string; accessToken: string; shopName: string; scope: string; expiresAt?: string
} | null> {
  const db = getPool()
  if (!db) return null
  const res = await db.query(
    `SELECT shop_domain, access_token, shop_name, scope, expires_at FROM shopify_tokens WHERE client_id = $1`,
    [clientId]
  )
  if (!res.rows.length) return null
  const r = res.rows[0]
  return {
    shopDomain: r.shop_domain,
    accessToken: r.access_token,
    shopName: r.shop_name,
    scope: r.scope,
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : undefined,
  }
}

export async function dbDeleteShopifyToken(clientId: string): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(`DELETE FROM shopify_tokens WHERE client_id = $1`, [clientId])
}
