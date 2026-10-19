import { getPool } from '../lib/db'
import { currentWindow, previousWindow, pctChange, daysForRange, DateWindow } from '../lib/dateWindows'
import { metaReportedRevenueOf } from '../lib/meta-actions'
import {
  dbGetToken as dbGetMetaToken, getAccountInsightsForWindow as getMetaInsightsForWindow,
  getDailyInsights as getMetaDailyInsights,
} from './meta'
import {
  dbGetGoogleToken, getValidAccessToken as getValidGoogleAccessToken,
  getGoogleAccountInsightsForWindow, getGoogleDailyInsightsForWindow,
} from './google'
import {
  dbGetShopifyToken, getOrdersByChannel, getPaidChannelSessions, getTotalSessions, getSalesByCountry,
  getNewCustomerCount, getNetRevenueByDay, AttributionChannel, ChannelTotals,
} from './shopify'

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
  // Platform-reported ROAS (each platform's own claimed revenue ÷ its own
  // spend) — NOT the truth-based number (that's `mer`, aliased here as
  // `blendedRoas` since ad-platform users read "ROAS" more readily than
  // "MER"). Kept clearly separate so a Meta/Google toggle can show either
  // platform's own self-reported figure without it being confused for truth.
  metaRoas: number
  googleRoas: number
  blendedRoas: number
  // Site-wide, not Meta-attributed — the real denominator for conversion rate.
  totalSessions: number
  totalOrders: number
  conversionRate: number
  sourceConfidence: 'exact' | 'approximate'
  // Per-channel delivery + truth metrics so Overview's Meta/Google/Blended
  // switch can drive every card, not just the ROAS hero. CTR/CPM are derived
  // from raw clicks/impressions/spend on every channel so the three views are
  // calculated identically.
  metaImpressions: number
  metaClicks: number
  metaCtr: number
  metaCpm: number
  googleImpressions: number
  googleClicks: number
  googleCtr: number
  googleCpm: number
  blendedImpressions: number
  blendedClicks: number
  blendedCtr: number
  blendedCpm: number
  googleSessions: number
  blendedSessions: number
  googleAttributedCPR: number
  blendedAttributedCPR: number
  blendedPlatformRoas: number
}

export interface OverviewMetricsResponse {
  current: PeriodMetrics
  previous: PeriodMetrics
  deltas: Record<string, number>
  countryBreakdown: { country: string; orders: number; netSales: number }[]
  connected: { meta: boolean; google: boolean; shopify: boolean }
  // Set when a connected platform's API call for the *current* window failed
  // (e.g. Meta's dev-tier usage throttle) rather than genuinely having zero
  // spend — lets the frontend show "temporarily unavailable" instead of a
  // silent, misleading 0. Previously this failure was swallowed into a plain
  // 0 with no way to tell it apart from a real zero-spend period.
  platformErrors: { meta: string | null; google: string | null }
  // 'sync_error' = a token is saved but no longer works (revoked/expired),
  // which `connected` alone can't express — it collapses that into "not
  // connected", hiding that the client *had* Google and it broke.
  platformStatus: { meta: PlatformStatus; google: PlatformStatus }
}

export type PlatformStatus = 'live' | 'sync_error' | 'not_connected'

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
  totalSessions: number
  newCustomerCount: number
  newCustomerDataAvailable: boolean
  nCACSourceApproximate: boolean
  metaImpressions: number
  metaClicks: number
  googleImpressions: number
  googleClicks: number
  googleSessions: number
}): PeriodMetrics {
  const {
    metaSpend, metaReportedRevenue, googleSpend, googleReportedRevenue,
    channelTotals, metaSessions, totalSessions, newCustomerCount, newCustomerDataAvailable, nCACSourceApproximate,
    metaImpressions, metaClicks, googleImpressions, googleClicks, googleSessions,
  } = input
  const ctrOf = (clicks: number, impressions: number) => (impressions > 0 ? (clicks / impressions) * 100 : 0)
  const cpmOf = (spend: number, impressions: number) => (impressions > 0 ? (spend / impressions) * 1000 : 0)

  const shopifyNetRevenue = Object.values(channelTotals).reduce((sum, b) => sum + b.netSales, 0)
  const totalOrders = Object.values(channelTotals).reduce((sum, b) => sum + b.orders, 0)
  const conversionRate = totalSessions > 0 ? (totalOrders / totalSessions) * 100 : 0
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

  const metaRoas = metaSpend > 0 ? metaReportedRevenue / metaSpend : 0
  const googleRoas = googleSpend > 0 ? googleReportedRevenue / googleSpend : 0

  const blendedImpressions = metaImpressions + googleImpressions
  const blendedClicks = metaClicks + googleClicks
  const paidAttributedOrders = metaAttributedOrders + googleAttributedOrders

  return {
    metaImpressions, metaClicks, metaCtr: ctrOf(metaClicks, metaImpressions), metaCpm: cpmOf(metaSpend, metaImpressions),
    googleImpressions, googleClicks, googleCtr: ctrOf(googleClicks, googleImpressions), googleCpm: cpmOf(googleSpend, googleImpressions),
    blendedImpressions, blendedClicks, blendedCtr: ctrOf(blendedClicks, blendedImpressions), blendedCpm: cpmOf(blendedSpend, blendedImpressions),
    googleSessions,
    blendedSessions: metaSessions + googleSessions,
    googleAttributedCPR: googleAttributedOrders > 0 ? googleSpend / googleAttributedOrders : 0,
    blendedAttributedCPR: paidAttributedOrders > 0 ? blendedSpend / paidAttributedOrders : 0,
    blendedPlatformRoas: blendedSpend > 0 ? platformClaimedRevenue / blendedSpend : 0,
    metaSpend, googleSpend, blendedSpend,
    metaReportedRevenue, googleReportedRevenue, shopifyNetRevenue,
    metaSessions, metaAttributedOrders, googleAttributedOrders,
    attributedCPR, mer,
    newCustomerCount, nCAC, newCustomerDataAvailable,
    platformClaimedRevenue, overClaimMultiplier,
    metaChannelNetRevenue, googleChannelNetRevenue,
    metaOverClaimMultiplier, googleOverClaimMultiplier,
    metaRoas, googleRoas, blendedRoas: mer,
    totalSessions, totalOrders, conversionRate,
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
): Promise<{ metrics: PeriodMetrics; errors: { meta: string | null; google: string | null } }> {
  let metaError: string | null = null
  let googleError: string | null = null
  const [metaIns, googleIns, ordersByChannel, paidSessions, totalSessions] = await Promise.all([
    meta ? getMetaInsightsForWindow(meta.adAccountId, meta.accessToken, window).catch((err) => { metaError = err.message; return null }) : null,
    google ? getGoogleAccountInsightsForWindow(google.customerId, google.accessToken, window).catch((err) => { googleError = err.message; return null }) : null,
    shopify ? getOrdersByChannel(shopify.shopDomain, shopify.accessToken, window).catch(() => null) : null,
    shopify ? getPaidChannelSessions(shopify.shopDomain, shopify.accessToken, window).catch(() => ({ meta: 0, google: 0 })) : { meta: 0, google: 0 },
    shopify ? getTotalSessions(shopify.shopDomain, shopify.accessToken, window).catch(() => 0) : 0,
  ])

  // A connected platform's insights call can come back with no thrown error
  // yet still hand us nothing — Meta's account-level endpoint has been
  // observed returning an empty data array (no explicit error) during
  // transient internal processing delays. That silently produced a real
  // metaSpend/metaRoas of 0 indistinguishable from a genuine zero-spend
  // period. Treat "connected but got nothing back" as an error too, not
  // just an explicit catch.
  if (meta && !metaIns && !metaError) metaError = 'No Meta insights data returned for this window'
  if (google && !googleIns && !googleError) googleError = 'No Google Ads insights data returned for this window'

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

  const metrics = derivePeriodMetrics({
    metaSpend: metaIns ? parseFloat(metaIns.spend) || 0 : 0,
    metaReportedRevenue: metaIns ? metaReportedRevenueOf(metaIns) : 0,
    googleSpend: googleIns ? (googleIns.costMicros ?? 0) / 1_000_000 : 0,
    googleReportedRevenue: googleIns ? (googleIns.conversionsValue ?? 0) : 0,
    channelTotals: ordersByChannel ?? EMPTY_CHANNEL_TOTALS,
    metaSessions: paidSessions.meta, googleSessions: paidSessions.google, totalSessions,
    newCustomerCount, newCustomerDataAvailable, nCACSourceApproximate,
    metaImpressions: metaIns ? Number(metaIns.impressions) || 0 : 0,
    metaClicks: metaIns ? Number(metaIns.clicks) || 0 : 0,
    googleImpressions: googleIns ? Number(googleIns.impressions) || 0 : 0,
    googleClicks: googleIns ? Number(googleIns.clicks) || 0 : 0,
  })
  return { metrics, errors: { meta: metaError, google: googleError } }
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
  clientId: string, dateRange: string, country?: string, bypassCache = false
): Promise<OverviewMetricsResponse> {
  const [metaToken, googleToken, shopifyToken] = await Promise.all([
    dbGetMetaToken(clientId),
    dbGetGoogleToken(clientId),
    dbGetShopifyToken(clientId),
  ])

  // Keyed on the selected Meta ad account too — switching accounts must never
  // serve the previous account's numbers for the rest of the cache window.
  // Bump the version whenever the response shape changes.
  const cacheKey = `overview:v2:${clientId}:${metaToken?.selectedAdAccountId ?? 'none'}:${dateRange}:${country ?? 'all'}`
  if (!bypassCache) {
    const cached = await getCached(cacheKey)
    if (cached) return cached
  }

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
  const [currentResult, previousResult] = await Promise.all([
    computePeriodMetrics(clientId, currentWindow(dateRange), days, meta, google, shopify),
    computePeriodMetrics(clientId, previousWindow(dateRange), days, meta, google, shopify),
  ])
  const current = currentResult.metrics
  const previous = previousResult.metrics

  const deltas: Record<string, number> = {}
  for (const key of Object.keys(current) as (keyof PeriodMetrics)[]) {
    if (typeof current[key] === 'number' && typeof previous[key] === 'number') {
      deltas[key] = pctChange(current[key] as number, previous[key] as number)
    }
  }

  let countryBreakdown: { country: string; orders: number; netSales: number }[] = []
  if (shopify) {
    try {
      const { columns, rows } = await getSalesByCountry(shopify.shopDomain, shopify.accessToken, currentWindow(dateRange))
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

  const statusOf = (hasToken: boolean, usable: boolean, error: string | null): PlatformStatus =>
    !hasToken ? 'not_connected' : !usable || error ? 'sync_error' : 'live'

  const response: OverviewMetricsResponse = {
    current, previous, deltas, countryBreakdown,
    connected: { meta: !!meta, google: !!google, shopify: !!shopify },
    platformErrors: {
      meta: currentResult.errors.meta,
      google: currentResult.errors.google
        ?? (googleToken && !google ? 'Google Ads sync interrupted — the saved connection no longer works. Reconnect Google Ads to resume.' : null),
    },
    platformStatus: {
      meta: statusOf(!!metaToken?.selectedAdAccountId, !!meta, currentResult.errors.meta),
      google: statusOf(!!googleToken, !!google, currentResult.errors.google),
    },
  }

  // Don't cache a response built from a live platform-call failure — e.g.
  // Meta's dev-tier usage throttle temporarily rejecting the insights call.
  // Caching it would keep serving that same failure (and the misleading 0s
  // it produces) for the full 10-minute window even after Meta recovers.
  if (!currentResult.errors.meta && !currentResult.errors.google) {
    await setCached(cacheKey, response).catch(() => {})
  }
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
    shopify ? getNetRevenueByDay(shopify.shopDomain, shopify.accessToken, window).catch(() => null) : null,
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
