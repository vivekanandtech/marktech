import { getPool } from '../lib/db'
import { currentWindow, previousWindow, pctChange, daysForRange, DateWindow } from '../lib/dateWindows'
import {
  dbGetToken as dbGetMetaToken, getAccountInsightsForWindow as getMetaInsightsForWindow,
  getDailyInsights as getMetaDailyInsights,
} from './meta'
import {
  dbGetGoogleToken, getValidAccessToken as getValidGoogleAccessToken,
  getGoogleAccountInsightsForWindow, getGoogleDailyInsightsForWindow,
} from './google'
import {
  dbGetShopifyToken, getOrdersByChannel, getMetaSessions, getSalesByCountry,
  getNewCustomerCount, getNetRevenueByDay, AttributionChannel, ChannelTotals,
} from './shopify'

const PURCHASE_ACTION_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']

export function metaReportedRevenueOf(ins: any): number {
  const values = Array.isArray(ins?.action_values) ? ins.action_values : []
  return values
    .filter((a: any) => PURCHASE_ACTION_TYPES.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + (parseFloat(a.value) || 0), 0)
}

export interface PeriodMetrics {
  metaSpend: number
  googleSpend: number
  blendedSpend: number
  metaReportedRevenue: number
  googleReportedRevenue: number
  shopifyNetRevenue: number
  metaSessions: number
  metaAttributedOrders: number
  googleAttributedOrders: number
  attributedCPR: number
  mer: number
  newCustomerCount: number
  nCAC: number
  newCustomerDataAvailable: boolean
  platformClaimedRevenue: number
  overClaimMultiplier: number
  // Per-channel over-claim — compares each platform's own self-reported
  // revenue against Shopify's order-level revenue *attributed to that same
  // channel* (not blended net revenue), so a rising Meta ratio can be told
  // apart from a rising Google one instead of hiding behind one blended number.
  metaChannelNetRevenue: number
  googleChannelNetRevenue: number
  metaOverClaimMultiplier: number
  googleOverClaimMultiplier: number
  sourceConfidence: 'exact' | 'approximate'
}

export interface OverviewMetricsResponse {
  current: PeriodMetrics
  previous: PeriodMetrics
  deltas: Record<string, number>
  countryBreakdown: { country: string; orders: number; netSales: number }[]
  connected: { meta: boolean; google: boolean; shopify: boolean }
}

// Pure calculation core — no I/O, takes already-fetched raw data and produces
// the final metrics. Kept separate from computePeriodMetrics below so the math
// (the part most likely to silently produce a wrong number) is unit-testable
// without mocking fetch/DB for every case.
export function derivePeriodMetrics(input: {
  metaSpend: number
  metaReportedRevenue: number
  googleSpend: number
  googleReportedRevenue: number
  channelTotals: Record<AttributionChannel, ChannelTotals>
  metaSessions: number
  newCustomerCount: number
  newCustomerDataAvailable: boolean
  nCACSourceApproximate: boolean
}): PeriodMetrics {
  const {
    metaSpend, metaReportedRevenue, googleSpend, googleReportedRevenue,
    channelTotals, metaSessions, newCustomerCount, newCustomerDataAvailable, nCACSourceApproximate,
  } = input

  const shopifyNetRevenue = Object.values(channelTotals).reduce((sum, b) => sum + b.netSales, 0)
  const metaAttributedOrders = channelTotals.meta.orders
  const googleAttributedOrders = channelTotals.google.orders

  const blendedSpend = metaSpend + googleSpend
  const attributedCPR = metaAttributedOrders > 0 ? metaSpend / metaAttributedOrders : 0
  const mer = blendedSpend > 0 ? shopifyNetRevenue / blendedSpend : 0
  const platformClaimedRevenue = metaReportedRevenue + googleReportedRevenue
  const overClaimMultiplier = shopifyNetRevenue > 0 ? platformClaimedRevenue / shopifyNetRevenue : 0
  const nCAC = newCustomerDataAvailable && newCustomerCount > 0 ? blendedSpend / newCustomerCount : 0

  const metaChannelNetRevenue = channelTotals.meta.netSales
  const googleChannelNetRevenue = channelTotals.google.netSales
  const metaOverClaimMultiplier = metaChannelNetRevenue > 0 ? metaReportedRevenue / metaChannelNetRevenue : 0
  const googleOverClaimMultiplier = googleChannelNetRevenue > 0 ? googleReportedRevenue / googleChannelNetRevenue : 0

  return {
    metaSpend, googleSpend, blendedSpend,
    metaReportedRevenue, googleReportedRevenue, shopifyNetRevenue,
    metaSessions, metaAttributedOrders, googleAttributedOrders,
    attributedCPR, mer,
    newCustomerCount, nCAC, newCustomerDataAvailable,
    platformClaimedRevenue, overClaimMultiplier,
    metaChannelNetRevenue, googleChannelNetRevenue,
    metaOverClaimMultiplier, googleOverClaimMultiplier,
    sourceConfidence: nCACSourceApproximate ? 'approximate' : 'exact',
  }
}

const EMPTY_CHANNEL_TOTALS: Record<AttributionChannel, ChannelTotals> = {
  meta: { orders: 0, netSales: 0 }, google: { orders: 0, netSales: 0 },
  direct: { orders: 0, netSales: 0 }, organic: { orders: 0, netSales: 0 }, other: { orders: 0, netSales: 0 },
}

async function computePeriodMetrics(
  clientId: string,
  window: DateWindow,
  days: number,
  meta: { accessToken: string; adAccountId: string } | null,
  google: { accessToken: string; customerId: string } | null,
  shopify: { shopDomain: string; accessToken: string } | null
): Promise<PeriodMetrics> {
  const [metaIns, googleIns, ordersByChannel, metaSessions] = await Promise.all([
    meta ? getMetaInsightsForWindow(meta.adAccountId, meta.accessToken, window).catch(() => null) : null,
    google ? getGoogleAccountInsightsForWindow(google.customerId, google.accessToken, window).catch(() => null) : null,
    shopify ? getOrdersByChannel(shopify.shopDomain, shopify.accessToken, days).catch(() => null) : null,
    shopify ? getMetaSessions(shopify.shopDomain, shopify.accessToken, days).catch(() => 0) : 0,
  ])

  let newCustomerCount = 0
  let newCustomerDataAvailable = false
  let nCACSourceApproximate = false
  if (shopify) {
    try {
      const nc = await getNewCustomerCount(shopify.shopDomain, shopify.accessToken, days)
      newCustomerCount = nc.newCustomers
      newCustomerDataAvailable = true
      nCACSourceApproximate = nc.approximate
    } catch {
      // read_customers scope not yet granted (needs a Shopify re-auth) — surface
      // as unavailable rather than a misleading 0, which would read as "free acquisition."
      newCustomerDataAvailable = false
    }
  }

  return derivePeriodMetrics({
    metaSpend: metaIns ? parseFloat(metaIns.spend) || 0 : 0,
    metaReportedRevenue: metaIns ? metaReportedRevenueOf(metaIns) : 0,
    googleSpend: googleIns ? (googleIns.costMicros ?? 0) / 1_000_000 : 0,
    googleReportedRevenue: googleIns ? (googleIns.conversionsValue ?? 0) : 0,
    channelTotals: ordersByChannel ?? EMPTY_CHANNEL_TOTALS,
    metaSessions,
    newCustomerCount, newCustomerDataAvailable, nCACSourceApproximate,
  })
}

const CACHE_TTL_MS = 10 * 60 * 1000

async function getCached(key: string): Promise<OverviewMetricsResponse | null> {
  const db = getPool()
  if (!db) return null
  const res = await db.query(
    `SELECT payload, computed_at FROM metrics_cache WHERE cache_key = $1`, [key]
  )
  if (!res.rows.length) return null
  const { payload, computed_at } = res.rows[0]
  if (Date.now() - new Date(computed_at).getTime() > CACHE_TTL_MS) return null
  return payload as OverviewMetricsResponse
}

async function setCached(key: string, payload: OverviewMetricsResponse): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO metrics_cache (cache_key, payload, computed_at) VALUES ($1, $2, NOW())
     ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
    [key, JSON.stringify(payload)]
  )
}

export async function computeOverviewMetrics(
  clientId: string, dateRange: string, country?: string
): Promise<OverviewMetricsResponse> {
  const cacheKey = `overview:${clientId}:${dateRange}:${country ?? 'all'}`
  const cached = await getCached(cacheKey)
  if (cached) return cached

  const [metaToken, googleToken, shopifyToken] = await Promise.all([
    dbGetMetaToken(clientId),
    dbGetGoogleToken(clientId),
    dbGetShopifyToken(clientId),
  ])

  const meta = metaToken?.selectedAdAccountId
    ? { accessToken: metaToken.accessToken, adAccountId: metaToken.selectedAdAccountId }
    : null

  let google: { accessToken: string; customerId: string } | null = null
  if (googleToken?.customerId) {
    const accessToken = await getValidGoogleAccessToken(clientId).catch(() => null)
    if (accessToken) google = { accessToken, customerId: googleToken.customerId }
  }

  const shopify = shopifyToken ? { shopDomain: shopifyToken.shopDomain, accessToken: shopifyToken.accessToken } : null

  const days = daysForRange(dateRange)
  const [current, previous] = await Promise.all([
    computePeriodMetrics(clientId, currentWindow(dateRange), days, meta, google, shopify),
    computePeriodMetrics(clientId, previousWindow(dateRange), days, meta, google, shopify),
  ])

  const deltas: Record<string, number> = {}
  for (const key of Object.keys(current) as (keyof PeriodMetrics)[]) {
    if (typeof current[key] === 'number' && typeof previous[key] === 'number') {
      deltas[key] = pctChange(current[key] as number, previous[key] as number)
    }
  }

  let countryBreakdown: { country: string; orders: number; netSales: number }[] = []
  if (shopify) {
    try {
      const { columns, rows } = await getSalesByCountry(shopify.shopDomain, shopify.accessToken, days)
      const countryIdx = columns.findIndex((c) => c.name === 'billing_country')
      const ordersIdx = columns.findIndex((c) => c.name === 'orders')
      const salesIdx = columns.findIndex((c) => c.name === 'net_sales')
      countryBreakdown = rows
        .filter((r) => r[countryIdx])
        .map((r) => ({
          country: r[countryIdx],
          orders: Number(r[ordersIdx]) || 0,
          netSales: Number(r[salesIdx]) || 0,
        }))
    } catch {
      // non-fatal — Overview still renders without the country breakdown
    }
  }

  const response: OverviewMetricsResponse = {
    current, previous, deltas, countryBreakdown,
    connected: { meta: !!meta, google: !!google, shopify: !!shopify },
  }

  await setCached(cacheKey, response).catch(() => {})
  return response
}

export interface ReconciliationDay {
  date: string
  platformClaimed: number
  shopifyTruth: number
  overClaimMultiplier: number
}

export interface ReconciliationTrendResponse {
  days: ReconciliationDay[]
  avgOverClaimMultiplier: number
  connected: { meta: boolean; google: boolean; shopify: boolean }
}

export async function computeReconciliationTrend(
  clientId: string, dateRange: string
): Promise<ReconciliationTrendResponse> {
  const days = daysForRange(dateRange)

  const [metaToken, googleToken, shopifyToken] = await Promise.all([
    dbGetMetaToken(clientId),
    dbGetGoogleToken(clientId),
    dbGetShopifyToken(clientId),
  ])

  const meta = metaToken?.selectedAdAccountId
    ? { accessToken: metaToken.accessToken, adAccountId: metaToken.selectedAdAccountId }
    : null

  let google: { accessToken: string; customerId: string } | null = null
  if (googleToken?.customerId) {
    const accessToken = await getValidGoogleAccessToken(clientId).catch(() => null)
    if (accessToken) google = { accessToken, customerId: googleToken.customerId }
  }

  const shopify = shopifyToken ? { shopDomain: shopifyToken.shopDomain, accessToken: shopifyToken.accessToken } : null
  const window = currentWindow(dateRange)

  const [metaDaily, googleDaily, shopifyDaily] = await Promise.all([
    meta ? getMetaDailyInsights(meta.adAccountId, meta.accessToken, dateRange).catch(() => []) : [],
    google ? getGoogleDailyInsightsForWindow(google.customerId, google.accessToken, window).catch(() => []) : [],
    shopify ? getNetRevenueByDay(shopify.shopDomain, shopify.accessToken, days).catch(() => null) : null,
  ])

  const claimedByDate = new Map<string, number>()
  for (const row of metaDaily as any[]) {
    const date = row.date_start
    if (!date) continue
    claimedByDate.set(date, (claimedByDate.get(date) ?? 0) + metaReportedRevenueOf(row))
  }
  for (const row of googleDaily as any[]) {
    const date = row.segments?.date
    if (!date) continue
    claimedByDate.set(date, (claimedByDate.get(date) ?? 0) + (Number(row.metrics?.conversionsValue) || 0))
  }

  const truthByDate = new Map<string, number>()
  if (shopifyDaily) {
    const dayIdx = shopifyDaily.columns.findIndex((c) => c.name === 'day')
    const salesIdx = shopifyDaily.columns.findIndex((c) => c.name === 'net_sales')
    for (const row of shopifyDaily.rows) {
      const date = String(row[dayIdx]).slice(0, 10)
      truthByDate.set(date, (truthByDate.get(date) ?? 0) + (Number(row[salesIdx]) || 0))
    }
  }

  const allDates = Array.from(new Set([...claimedByDate.keys(), ...truthByDate.keys()])).sort()
  const daysOut: ReconciliationDay[] = allDates.map((date) => {
    const platformClaimed = claimedByDate.get(date) ?? 0
    const shopifyTruth = truthByDate.get(date) ?? 0
    const overClaimMultiplier = shopifyTruth > 0 ? platformClaimed / shopifyTruth : 0
    return { date, platformClaimed, shopifyTruth, overClaimMultiplier }
  })

  const totalClaimed = daysOut.reduce((sum, d) => sum + d.platformClaimed, 0)
  const totalTruth = daysOut.reduce((sum, d) => sum + d.shopifyTruth, 0)
  const avgOverClaimMultiplier = totalTruth > 0 ? totalClaimed / totalTruth : 0

  return {
    days: daysOut,
    avgOverClaimMultiplier,
    connected: { meta: !!meta, google: !!google, shopify: !!shopify },
  }
}
