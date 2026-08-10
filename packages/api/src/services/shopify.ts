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
  const scopes = 'read_analytics,read_orders,read_products,read_reports'
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
  // Shopify's `rows` field returns objects keyed by column name, not arrays —
  // reshape into arrays ordered by `columns` to match the existing table contract.
  const rows = (td.rows ?? []).map((row: Record<string, string>) =>
    columns.map((col: { name: string }) => row[col.name] ?? '')
  )

  return { columns, rows }
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
