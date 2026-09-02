// Cross-source product-level performance — composes Shopify (revenue/orders/
// units, the source of truth for what actually sold) with Google Shopping/
// PMax (ad cost/conversions, only available for products advertised via a
// Shopping feed). Meta is deliberately excluded: its `breakdowns=product_id`
// only works for Catalog/DPA campaigns and is reliable for clicks/impressions
// only, not revenue — including it here would misrepresent estimates as truth.
//
// Matching is exact-id only, no fuzzy title matching — an unmatched Google
// product is shown as its own line rather than silently dropped or merged
// into the wrong product (see `parseShopifyProductId` in google.ts).

import { currentWindow, previousWindow, pctChange, DateWindow } from '../lib/dateWindows'
import { dbGetShopifyToken, getProductPerformance, getProductSessionFunnel, ProductPerformance, ProductSessionFunnel } from './shopify'
import { dbGetGoogleToken, getValidAccessToken as getValidGoogleAccessToken, getGoogleProductPerformanceForWindow, GoogleProductRow } from './google'

export interface ProductRow {
  productId: string
  title: string
  shopifyRevenue: number
  shopifyOrders: number
  unitsSold: number
  googleCost: number
  googleConversions: number
  googleConversionsValue: number
  googleRoas: number
  hasGoogleData: boolean
  // Real, unattributed Shopify site traffic to this product's page — not ad
  // spend-driven, and not derivable from the sales/product_id GROUP BY (the
  // sessions table has no such dimension); joined from landing_page_path via
  // the product handle instead. 0 means genuinely no recorded sessions in the
  // window, not "unavailable".
  sessions: number
  addToCart: number
  checkoutsInitiated: number
}

export interface ProductPerformanceResponse {
  products: ProductRow[]
  deltas: Record<string, Record<string, number>>  // productId -> field -> pctChange
  connected: { shopify: boolean; google: boolean }
  // Surfaced so the UI can flag a real, observed failure mode: the Google Ads
  // account linked to a client can be a DIFFERENT business's account (wrong
  // customer id saved during connect) — in that case every Google-advertised
  // product id belongs to someone else's catalog and will never match this
  // client's Shopify products, no matter how healthy the actual ad account is.
  googleAccountName: string | null
  googleMatchedProductCount: number
}

export function mergeProductSources(shopifyRows: ProductPerformance[], googleRows: GoogleProductRow[]): ProductRow[] {
  const rows: ProductRow[] = shopifyRows.map((s) => ({
    productId: s.productId,
    title: s.productTitle,
    shopifyRevenue: s.netSales,
    shopifyOrders: s.orders,
    unitsSold: s.unitsSold,
    googleCost: 0,
    googleConversions: 0,
    googleConversionsValue: 0,
    googleRoas: 0,
    hasGoogleData: false,
    sessions: 0,
    addToCart: 0,
    checkoutsInitiated: 0,
  }))
  const byProductId = new Map(rows.map((r) => [r.productId, r]))

  for (const g of googleRows) {
    const googleRoas = g.cost > 0 ? g.conversionsValue / g.cost : 0
    const existing = byProductId.get(g.productId)
    if (existing) {
      existing.googleCost = g.cost
      existing.googleConversions = g.conversions
      existing.googleConversionsValue = g.conversionsValue
      existing.googleRoas = googleRoas
      existing.hasGoogleData = true
    } else {
      // No matching Shopify sales for this product in the window (or the item
      // id didn't parse to a Shopify product id) — real spend with zero
      // attributed Shopify revenue is itself a meaningful signal, not an error.
      const row: ProductRow = {
        productId: g.productId,
        title: g.productTitle,
        shopifyRevenue: 0,
        shopifyOrders: 0,
        unitsSold: 0,
        googleCost: g.cost,
        googleConversions: g.conversions,
        googleConversionsValue: g.conversionsValue,
        googleRoas,
        hasGoogleData: true,
        sessions: 0,
        addToCart: 0,
        checkoutsInitiated: 0,
      }
      rows.push(row)
      byProductId.set(g.productId, row)
    }
  }

  return rows.sort((a, b) => (b.shopifyRevenue + b.googleCost) - (a.shopifyRevenue + a.googleCost))
}

// Enriches rows in place with real Shopify site-traffic funnel data, keyed by
// the same Shopify product id used for the revenue/ad-spend join above.
export function applySessionFunnel(products: ProductRow[], funnelByProductId: Record<string, ProductSessionFunnel>): void {
  for (const p of products) {
    const f = funnelByProductId[p.productId]
    p.sessions = f?.sessions ?? 0
    p.addToCart = f?.addToCart ?? 0
    p.checkoutsInitiated = f?.checkoutsInitiated ?? 0
  }
}

async function fetchSide(
  clientId: string,
  window: DateWindow
): Promise<{
  shopifyRows: ProductPerformance[]
  googleRows: GoogleProductRow[]
  sessionFunnel: Record<string, ProductSessionFunnel>
  connected: { shopify: boolean; google: boolean }
  googleAccountName: string | null
}> {
  const [shopifyToken, googleToken] = await Promise.all([
    dbGetShopifyToken(clientId),
    dbGetGoogleToken(clientId),
  ])

  const [shopifyRows, sessionFunnel] = shopifyToken
    ? await Promise.all([
        getProductPerformance(shopifyToken.shopDomain, shopifyToken.accessToken, window).catch(() => []),
        getProductSessionFunnel(shopifyToken.shopDomain, shopifyToken.accessToken, window).catch(() => ({})),
      ])
    : [[], {}]

  let googleRows: GoogleProductRow[] = []
  if (googleToken?.customerId) {
    const accessToken = await getValidGoogleAccessToken(clientId).catch(() => null)
    if (accessToken) {
      googleRows = await getGoogleProductPerformanceForWindow(googleToken.customerId, accessToken, window).catch(() => [])
    }
  }

  return {
    shopifyRows, googleRows, sessionFunnel,
    connected: { shopify: !!shopifyToken, google: !!googleToken?.customerId },
    googleAccountName: googleToken?.customerName ?? null,
  }
}

export async function computeProductPerformance(clientId: string, dateRange: string): Promise<ProductPerformanceResponse> {
  const [current, previous] = await Promise.all([
    fetchSide(clientId, currentWindow(dateRange)),
    fetchSide(clientId, previousWindow(dateRange)),
  ])

  const products = mergeProductSources(current.shopifyRows, current.googleRows)
  applySessionFunnel(products, current.sessionFunnel)

  const previousProducts = mergeProductSources(previous.shopifyRows, previous.googleRows)
  applySessionFunnel(previousProducts, previous.sessionFunnel)
  const previousById = new Map(previousProducts.map((p) => [p.productId, p]))

  const deltas: Record<string, Record<string, number>> = {}
  const numericFields: (keyof ProductRow)[] = [
    'shopifyRevenue', 'shopifyOrders', 'unitsSold', 'googleCost', 'googleConversions', 'googleRoas',
    'sessions', 'addToCart', 'checkoutsInitiated',
  ]
  for (const p of products) {
    const prev = previousById.get(p.productId)
    deltas[p.productId] = {}
    for (const field of numericFields) {
      deltas[p.productId][field] = pctChange(p[field] as number, (prev?.[field] as number) ?? 0)
    }
  }

  // A product only counts as genuinely "matched" if it has real Shopify
  // activity alongside the Google data — a Google-only row (zero Shopify
  // revenue/orders/units) means that item never actually sold here, which is
  // the exact symptom of the Google account being linked to a DIFFERENT
  // business's catalog rather than merely "not many products overlap."
  const googleMatchedProductCount = products.filter((p) =>
    p.hasGoogleData && (p.shopifyRevenue > 0 || p.shopifyOrders > 0 || p.unitsSold > 0)
  ).length

  return {
    products, deltas, connected: current.connected,
    googleAccountName: current.googleAccountName,
    googleMatchedProductCount,
  }
}
