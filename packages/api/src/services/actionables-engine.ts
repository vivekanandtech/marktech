import { getPool } from '../lib/db'
import { currentWindow, previousWindow, daysForRange, DateWindow } from '../lib/dateWindows'
import { maxActionCount, metaReportedRevenueOf, getFunnelCounts, PURCHASE_ACTION_TYPES } from '../lib/meta-actions'
import { computeOverviewMetrics, OverviewMetricsResponse } from './metrics-engine'
import {
  dbGetToken as dbGetMetaToken, getTopActiveInsights,
  getAccountInsightsForWindow, getAccountInsightsByCountry, getAdInsightsForCountry,
} from './meta'
import { dbGetShopifyToken, getTopProductsForCountry } from './shopify'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionableCategory = 'scale' | 'fix' | 'creative' | 'geography' | 'tracking' | 'budget'
export type ActionableSeverity = 'critical' | 'warning' | 'opportunity' | 'info'
export type ActionableStatus = 'new' | 'done' | 'dismissed'

export interface KV { label: string; value: string }

export interface Actionable {
  id: string
  rank: number
  type: string
  category: ActionableCategory
  severity: ActionableSeverity
  platform: 'meta' | 'google' | 'shopify' | 'cross'
  // Rendered as "<action> - <entityName>", the format the client asked for.
  action: string
  entityName: string
  entity: { level: 'campaign' | 'adset' | 'ad' | 'country' | 'account'; id: string | null; campaignId: string | null }
  context: string | null
  detail: string
  metrics: KV[]
  plan: KV[] | null
  topCreatives: { id: string; name: string; detail: string }[] | null
  topProducts: { name: string; detail: string }[] | null
  impact: number
  status: ActionableStatus
}

export interface ActionablesPayload {
  version: 2
  items: Actionable[]
  dateRange: string
  window: DateWindow
  clientName: string | null
  metaAccountName: string | null
  generatedAt: string
  notes: string[]
}

// ─── Formatting (₹, Indian grouping) ─────────────────────────────────────────

export function inr(v: number): string {
  const n = Math.round(v)
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`
  return `₹${n.toLocaleString('en-IN')}`
}
const x = (v: number) => `${v.toFixed(2)}x`
const pct = (v: number) => `${v.toFixed(1)}%`
const num = (v: number) => Math.round(v).toLocaleString('en-IN')
const roundTo = (v: number, step: number) => Math.round(v / step) * step
const orders = (n: number) => `${num(n)} ${n === 1 ? 'order' : 'orders'}`

// ─── Meta row summaries ──────────────────────────────────────────────────────

export interface MetaRow {
  id: string
  name: string
  campaignId: string
  campaignName: string
  adsetId: string | null
  adsetName: string | null
  spend: number
  revenue: number
  roas: number
  purchases: number
  costPerPurchase: number
  results: number
  costPerResult: number
  isPurchaseOptimised: boolean
  ctr: number
  frequency: number
  impressions: number
  addToCart: number
  initiateCheckout: number
}

function readResult(arr: any): { indicator: string | null; value: number } {
  const first = Array.isArray(arr) ? arr[0] : null
  if (!first) return { indicator: null, value: 0 }
  return { indicator: first.indicator ?? null, value: parseFloat(first.values?.[0]?.value) || 0 }
}

export function summarizeMetaRow(raw: any, level: 'adset' | 'ad'): MetaRow {
  const spend = parseFloat(raw.spend) || 0
  const revenue = metaReportedRevenueOf(raw)
  const purchases = maxActionCount(raw, PURCHASE_ACTION_TYPES)
  const funnel = getFunnelCounts(raw)
  const result = readResult(raw.results)
  const cpr = readResult(raw.cost_per_result).value
  const isPurchaseOptimised = !result.indicator || result.indicator.includes('purchase')
  const results = result.indicator ? result.value : purchases
  return {
    id: level === 'adset' ? raw.adset_id : raw.ad_id,
    name: level === 'adset' ? raw.adset_name : raw.ad_name,
    campaignId: raw.campaign_id,
    campaignName: raw.campaign_name,
    adsetId: raw.adset_id ?? null,
    adsetName: raw.adset_name ?? null,
    spend, revenue,
    roas: spend > 0 ? revenue / spend : 0,
    purchases,
    costPerPurchase: purchases > 0 ? spend / purchases : 0,
    results,
    costPerResult: cpr > 0 ? cpr : results > 0 ? spend / results : 0,
    isPurchaseOptimised,
    ctr: parseFloat(raw.ctr) || 0,
    frequency: parseFloat(raw.frequency) || 0,
    impressions: parseInt(raw.impressions, 10) || 0,
    addToCart: funnel.addToCart,
    initiateCheckout: funnel.initiateCheckout,
  }
}

// The exact metric set the client asked for in copied recommendations.
function entityMetrics(r: MetaRow, extra: KV[] = []): KV[] {
  return [
    { label: 'ROAS', value: x(r.roas) },
    { label: 'Cost per result', value: r.costPerResult > 0 ? inr(r.costPerResult) : '–' },
    { label: 'Amount spent', value: inr(r.spend) },
    { label: 'Add to carts', value: num(r.addToCart) },
    { label: 'Initiate checkouts', value: num(r.initiateCheckout) },
    ...extra,
  ]
}

// ─── Rule engine (pure — no I/O, unit-testable) ──────────────────────────────

export interface RuleInput {
  days: number
  account: { spend: number; revenue: number; purchases: number; addToCart: number } | null
  adsets: MetaRow[]
  ads: MetaRow[]
  previousAds: Map<string, MetaRow>
  overview: OverviewMetricsResponse | null
  geo: {
    code: string
    name: string
    metaSpend: number
    shopifyRevenue: number
    shopifyOrders: number
    topCreatives: { id: string; name: string; detail: string }[]
    topProducts: { name: string; detail: string }[]
  }[]
}

type Draft = Omit<Actionable, 'rank' | 'status'>

const CAPS: Record<string, number> = {
  scale_adset: 4, cut_adset: 4, pause_ad: 3, creative_fatigue: 4, winning_creative: 3,
  funnel_leak: 2, geo_scale: 2, geo_cut: 2,
}

export function runRules(input: RuleInput): Draft[] {
  const out: Draft[] = []
  const { days, account, overview } = input

  // ── Tracking / data integrity first: everything else rests on it ──────────
  if (overview?.connected.shopify) {
    const c = overview.current
    const paidAttributed = c.metaAttributedOrders + c.googleAttributedOrders
    if (c.totalOrders >= 20 && paidAttributed / c.totalOrders < 0.25) {
      const untagged = c.totalOrders - paidAttributed
      out.push({
        id: 'tracking_utm', type: 'tracking_utm', category: 'tracking', severity: 'critical', platform: 'shopify',
        action: 'Fix UTM Tracking', entityName: 'Shopify order attribution',
        entity: { level: 'account', id: null, campaignId: null }, context: 'Shopify · all orders',
        detail: `Only ${num(paidAttributed)} of ${num(c.totalOrders)} Shopify orders (${pct((paidAttributed / c.totalOrders) * 100)}) can be traced to a paid campaign; ${num(untagged)} arrive with no UTM or referrer. Until fixed, Attributed CPR and channel ROAS rest on a tiny sample. Add utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}} to every Meta ad URL and confirm checkout keeps the UTMs.`,
        metrics: [
          { label: 'Orders traced to ads', value: `${num(paidAttributed)} of ${num(c.totalOrders)}` },
          { label: 'Shopify revenue', value: inr(c.shopifyNetRevenue) },
          { label: 'Meta spend', value: inr(c.metaSpend) },
        ],
        plan: null, topCreatives: null, topProducts: null,
        impact: c.blendedSpend + 1e12,
      })
    }
    if (c.metaReportedRevenue > 0 && c.shopifyNetRevenue > 0 && c.metaReportedRevenue / c.shopifyNetRevenue >= 2) {
      const ratio = c.metaReportedRevenue / c.shopifyNetRevenue
      const exceedsStore = c.metaReportedRevenue > c.shopifyNetRevenue
      out.push({
        id: 'tracking_overclaim', type: 'tracking_overclaim', category: 'tracking', severity: 'critical', platform: 'meta',
        action: 'Verify Meta Pixel & Ad Account', entityName: 'Meta reported revenue',
        entity: { level: 'account', id: null, campaignId: null }, context: 'Meta vs Shopify',
        detail: `Meta claims ${inr(c.metaReportedRevenue)} in purchase value, ${x(ratio)} the ${inr(c.shopifyNetRevenue)} the whole store recorded in Shopify.${exceedsStore ? ' A platform claiming more than total store revenue usually means the connected ad account or pixel also tracks another store.' : ''} Confirm the selected ad account and pixel belong to this brand before acting on Meta-reported ROAS.`,
        metrics: [
          { label: 'Meta reported revenue', value: inr(c.metaReportedRevenue) },
          { label: 'Shopify revenue (all channels)', value: inr(c.shopifyNetRevenue) },
          { label: 'Meta ROAS (reported)', value: x(c.metaRoas) },
          { label: 'Blended ROAS (Shopify)', value: x(c.mer) },
        ],
        plan: null, topCreatives: null, topProducts: null,
        impact: c.metaSpend + 1e12 - 1,
      })
    }
  }

  if (overview?.platformStatus?.google === 'sync_error') {
    out.push({
      id: 'google_sync', type: 'google_sync', category: 'tracking', severity: 'critical', platform: 'google',
      action: 'Reconnect Google Ads', entityName: 'Google Ads connection',
      entity: { level: 'account', id: null, campaignId: null }, context: 'Google Ads',
      detail: 'Google Ads data is not syncing: the saved connection no longer works. Google spend, ROAS and campaigns show as NA, and Blended figures currently reflect Meta only. Reconnect Google Ads from the client\'s connections to resume.',
      metrics: [], plan: null, topCreatives: null, topProducts: null,
      impact: 1e12 - 2,
    })
  }

  if (!account || account.spend <= 0) return out

  const acctRoas = account.revenue / account.spend
  const acctCpp = account.purchases > 0 ? account.spend / account.purchases : 0
  const acctCartToPurchase = account.addToCart > 0 ? account.purchases / account.addToCart : 0
  const minSpend = Math.max(account.spend * 0.004, 1000 * days)
  const vsAcct = `account ${x(acctRoas)}`
  const perDay = (v: number) => `${inr(v / days)}/day`

  // ── Ad sets: scale winners, cut losers, funnel leaks ─────────────────────
  const adsets = input.adsets.filter((a) => a.isPurchaseOptimised)
  for (const a of adsets) {
    if (a.spend < minSpend) continue
    const context = `Meta · Ad set in ${a.campaignName}`

    if (a.roas >= acctRoas * 1.3 && a.purchases >= 3 && a.frequency < 3.5) {
      const step = a.frequency >= 2.5 ? 0.15 : 0.2
      const runRate = a.spend / days
      const target = runRate * (1 + step)
      out.push({
        id: `scale_adset:${a.id}`, type: 'scale_adset', category: 'scale', severity: 'opportunity', platform: 'meta',
        action: 'Increase Budget', entityName: a.name, entity: { level: 'adset', id: a.id, campaignId: a.campaignId }, context,
        detail: `ROAS ${x(a.roas)}, ${pct(((a.roas / acctRoas) - 1) * 100)} above ${vsAcct}, on ${inr(a.spend)} spend with ${num(a.purchases)} purchases. Frequency ${a.frequency.toFixed(1)} leaves headroom. Raise budget ${Math.round(step * 100)}%: ${perDay(a.spend)} → ${inr(target)}/day. Scale in steps of ≤20% every 3–4 days to protect the learning phase.`,
        metrics: entityMetrics(a, [{ label: 'Frequency', value: a.frequency.toFixed(2) }]),
        plan: [
          { label: 'Current run-rate', value: perDay(a.spend) },
          { label: 'Recommended', value: `${inr(target)}/day (+${Math.round(step * 100)}%)` },
          { label: 'Extra purchase value if ROAS holds', value: `${inr(runRate * step * a.roas)}/day` },
        ],
        topCreatives: null, topProducts: null,
        impact: runRate * step * a.roas * days,
      })
    } else if (a.roas < acctRoas * 0.6 || (a.purchases === 0 && acctCpp > 0 && a.spend >= acctCpp * 2)) {
      const severe = a.purchases === 0 || a.roas < acctRoas * 0.3
      const cut = severe ? 1 : 0.4
      out.push({
        id: `cut_adset:${a.id}`, type: 'cut_adset', category: 'fix', severity: severe ? 'critical' : 'warning', platform: 'meta',
        action: severe ? 'Pause Ad Set' : 'Reduce Spend', entityName: a.name, entity: { level: 'adset', id: a.id, campaignId: a.campaignId }, context,
        detail: a.purchases === 0
          ? `${inr(a.spend)} spent with zero purchases — ${x(a.spend / Math.max(acctCpp, 1))} the account's cost per purchase (${inr(acctCpp)}). Pause and move the ${perDay(a.spend)} to a proven ad set.`
          : `ROAS ${x(a.roas)} vs ${vsAcct}; cost per purchase ${inr(a.costPerPurchase)} vs account ${inr(acctCpp)} on ${inr(a.spend)} spend. ${severe ? `Pause until creative or audience is refreshed — frees ${perDay(a.spend)}.` : `Cut budget ~40% (${perDay(a.spend)} → ${inr((a.spend / days) * 0.6)}/day) and refresh creative before re-scaling.`}`,
        metrics: entityMetrics(a),
        plan: [
          { label: 'Current run-rate', value: perDay(a.spend) },
          { label: 'Recommended', value: severe ? 'Pause' : `${inr((a.spend / days) * 0.6)}/day (−40%)` },
          { label: 'Budget freed', value: `${inr((a.spend / days) * cut)}/day` },
        ],
        topCreatives: null, topProducts: null,
        impact: a.spend * cut * (severe ? 1.2 : 1),
      })
    }

    if (a.addToCart >= 20 && acctCartToPurchase > 0) {
      const rate = a.purchases / a.addToCart
      if (rate < acctCartToPurchase * 0.5) {
        out.push({
          id: `funnel_leak:${a.id}`, type: 'funnel_leak', category: 'fix', severity: 'warning', platform: 'meta',
          action: 'Fix Checkout Drop-off', entityName: a.name, entity: { level: 'adset', id: a.id, campaignId: a.campaignId }, context,
          detail: `${num(a.addToCart)} adds to cart but only ${num(a.purchases)} purchases (${pct(rate * 100)} cart-to-purchase vs account ${pct(acctCartToPurchase * 100)}). The ad is doing its job; the drop happens on site. Check price, stock, shipping cost and COD availability for this audience.`,
          metrics: entityMetrics(a, [{ label: 'Purchases', value: num(a.purchases) }]),
          plan: null, topCreatives: null, topProducts: null,
          impact: a.spend * 0.5,
        })
      }
    }
  }

  // ── Ads: fatigue, winners, dead spend ────────────────────────────────────
  const adMin = minSpend / 2
  for (const ad of input.ads) {
    if (ad.spend < adMin) continue
    const context = `Meta · ${ad.adsetName ?? ''} — ${ad.campaignName}`
    const prev = input.previousAds.get(ad.id)
    const ctrDrop = prev && prev.ctr > 0 ? ((ad.ctr - prev.ctr) / prev.ctr) * 100 : null

    if (ad.frequency >= 3.5 && ctrDrop !== null && ctrDrop <= -20) {
      out.push({
        id: `creative_fatigue:${ad.id}`, type: 'creative_fatigue', category: 'creative', severity: 'warning', platform: 'meta',
        action: 'Refresh Creative', entityName: ad.name, entity: { level: 'ad', id: ad.id, campaignId: ad.campaignId }, context,
        detail: `"${ad.name}" has reached frequency ${ad.frequency.toFixed(1)} and CTR fell ${Math.abs(ctrDrop).toFixed(0)}% vs the previous period (${pct(prev!.ctr)} → ${pct(ad.ctr)}). Refresh the creative to prevent ROAS erosion — current ROAS ${x(ad.roas)} on ${inr(ad.spend)}.`,
        metrics: entityMetrics(ad, [{ label: 'Frequency', value: ad.frequency.toFixed(2) }, { label: 'CTR', value: pct(ad.ctr) }]),
        plan: null, topCreatives: null, topProducts: null,
        impact: ad.spend * 0.6,
      })
      continue
    }
    if (ad.isPurchaseOptimised && ad.purchases === 0 && acctCpp > 0 && ad.spend >= acctCpp * 2) {
      out.push({
        id: `pause_ad:${ad.id}`, type: 'pause_ad', category: 'fix', severity: 'critical', platform: 'meta',
        action: 'Pause Ad', entityName: ad.name, entity: { level: 'ad', id: ad.id, campaignId: ad.campaignId }, context,
        detail: `${inr(ad.spend)} spent with zero purchases (${num(ad.addToCart)} adds to cart) — ${x(ad.spend / acctCpp)} the account's cost per purchase of ${inr(acctCpp)}. Pause it; the ad set will redistribute delivery to the ads that convert.`,
        metrics: entityMetrics(ad),
        plan: null, topCreatives: null, topProducts: null,
        impact: ad.spend,
      })
      continue
    }
    if (ad.isPurchaseOptimised && ad.roas >= acctRoas * 1.5 && ad.purchases >= 3 && ad.frequency < 3) {
      out.push({
        id: `winning_creative:${ad.id}`, type: 'winning_creative', category: 'creative', severity: 'opportunity', platform: 'meta',
        action: 'Scale Winning Creative', entityName: ad.name, entity: { level: 'ad', id: ad.id, campaignId: ad.campaignId }, context,
        detail: `ROAS ${x(ad.roas)} (${vsAcct}) on ${inr(ad.spend)} with ${num(ad.purchases)} purchases at ${inr(ad.costPerPurchase)} each. Duplicate this creative into your top prospecting ad sets and brief 2–3 variations on the same concept.`,
        metrics: entityMetrics(ad, [{ label: 'Purchases', value: num(ad.purchases) }]),
        plan: null, topCreatives: null, topProducts: null,
        impact: ad.spend * 0.5 * (ad.roas / Math.max(acctRoas, 0.1)),
      })
    }
  }

  // ── Geography: Shopify revenue by country vs Meta spend in that country ──
  const brandRoas = overview?.current.mer ?? 0
  for (const g of input.geo) {
    if (g.metaSpend < minSpend / 2 || g.shopifyRevenue <= 0 || brandRoas <= 0) continue
    const geoRoas = g.shopifyRevenue / g.metaSpend
    if (geoRoas >= Math.max(brandRoas * 1.3, 1.5)) {
      const floor = Math.max(brandRoas, 1.5)
      const target = roundTo(Math.min(g.metaSpend * 1.5, g.shopifyRevenue / floor), 1000)
      if (target < g.metaSpend * 1.15) continue
      const worstCase = g.shopifyRevenue / target
      out.push({
        id: `geo_scale:${g.code}`, type: 'geo_scale', category: 'geography', severity: 'opportunity', platform: 'cross',
        action: 'Increase Spend', entityName: g.name, entity: { level: 'country', id: g.code, campaignId: null }, context: 'Shopify revenue ÷ Meta spend by country',
        detail: `${g.name} generated ${inr(g.shopifyRevenue)} in Shopify revenue (${orders(g.shopifyOrders)}) on ${inr(g.metaSpend)} of Meta spend — a ${x(geoRoas)} blended ROAS vs ${x(brandRoas)} for the brand. Take ${g.name} spend to ${inr(target)} for the next ${days} days (+${Math.round((target / g.metaSpend - 1) * 100)}%): even with zero extra revenue, ROAS only falls to ${x(worstCase)}.`,
        metrics: [
          { label: `${g.name} blended ROAS`, value: x(geoRoas) },
          { label: 'Brand blended ROAS', value: x(brandRoas) },
          { label: 'Shopify revenue', value: inr(g.shopifyRevenue) },
          { label: 'Meta spend', value: inr(g.metaSpend) },
          { label: 'Orders', value: num(g.shopifyOrders) },
        ],
        plan: [
          { label: 'Current spend', value: `${inr(g.metaSpend)} (${perDay(g.metaSpend)})` },
          { label: 'Recommended spend', value: `${inr(target)} (${perDay(target)})` },
          { label: 'Worst-case ROAS (no extra revenue)', value: x(worstCase) },
        ],
        topCreatives: g.topCreatives.length ? g.topCreatives : null,
        topProducts: g.topProducts.length ? g.topProducts : null,
        impact: (target - g.metaSpend) * geoRoas,
      })
    } else if (geoRoas < brandRoas * 0.5 && g.metaSpend >= minSpend) {
      out.push({
        id: `geo_cut:${g.code}`, type: 'geo_cut', category: 'geography', severity: 'warning', platform: 'cross',
        action: 'Reduce Spend', entityName: g.name, entity: { level: 'country', id: g.code, campaignId: null }, context: 'Shopify revenue ÷ Meta spend by country',
        detail: `${inr(g.metaSpend)} of Meta spend in ${g.name} returned ${inr(g.shopifyRevenue)} in Shopify revenue (${orders(g.shopifyOrders)}) — ${x(geoRoas)} vs ${x(brandRoas)} brand blended ROAS. Cut ${g.name} budgets ~50% and reallocate to the best-returning markets.`,
        metrics: [
          { label: `${g.name} blended ROAS`, value: x(geoRoas) },
          { label: 'Brand blended ROAS', value: x(brandRoas) },
          { label: 'Shopify revenue', value: inr(g.shopifyRevenue) },
          { label: 'Meta spend', value: inr(g.metaSpend) },
        ],
        plan: [
          { label: 'Current spend', value: `${inr(g.metaSpend)} (${perDay(g.metaSpend)})` },
          { label: 'Recommended spend', value: `${inr(g.metaSpend * 0.5)} (${perDay(g.metaSpend * 0.5)})` },
        ],
        topCreatives: null, topProducts: null,
        impact: g.metaSpend * 0.5,
      })
    }
  }

  // ── Channel mix (only when both channels are genuinely live) ──────────────
  if (overview?.platformStatus?.meta === 'live' && overview.platformStatus.google === 'live') {
    const c = overview.current
    if (c.attributedCPR > 0 && c.googleAttributedCPR > 0) {
      const cheaper = c.attributedCPR < c.googleAttributedCPR ? 'Meta' : 'Google'
      const ratio = Math.max(c.attributedCPR, c.googleAttributedCPR) / Math.min(c.attributedCPR, c.googleAttributedCPR)
      if (ratio >= 1.4) {
        const fromSpend = cheaper === 'Meta' ? c.googleSpend : c.metaSpend
        out.push({
          id: 'budget_mix', type: 'budget_mix', category: 'budget', severity: 'opportunity', platform: 'cross',
          action: `Shift Budget to ${cheaper}`, entityName: 'Meta vs Google mix', entity: { level: 'account', id: null, campaignId: null }, context: 'Shopify-attributed cost per order',
          detail: `${cheaper} acquires a Shopify-verified order for ${inr(Math.min(c.attributedCPR, c.googleAttributedCPR))} vs ${inr(Math.max(c.attributedCPR, c.googleAttributedCPR))} on the other channel (${x(ratio)} cheaper). Move ~15% of ${cheaper === 'Meta' ? 'Google' : 'Meta'} spend (${inr(fromSpend * 0.15)}) to ${cheaper} and re-check in 7 days.`,
          metrics: [
            { label: 'Meta attributed CPR', value: inr(c.attributedCPR) },
            { label: 'Google attributed CPR', value: inr(c.googleAttributedCPR) },
            { label: 'Meta spend', value: inr(c.metaSpend) },
            { label: 'Google spend', value: inr(c.googleSpend) },
          ],
          plan: null, topCreatives: null, topProducts: null,
          impact: fromSpend * 0.15,
        })
      }
    }
  }

  // Keep the list decision-sized: biggest money at stake first, capped per rule.
  const counts: Record<string, number> = {}
  return out
    .sort((a, b) => b.impact - a.impact)
    .filter((d) => {
      const cap = CAPS[d.type]
      if (!cap) return true
      counts[d.type] = (counts[d.type] ?? 0) + 1
      return counts[d.type] <= cap
    })
}

// ─── Data gathering ──────────────────────────────────────────────────────────

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const countryName = (code: string) => { try { return regionNames.of(code) ?? code } catch { return code } }

async function gatherRuleInput(clientId: string, dateRange: string): Promise<{
  input: RuleInput; metaAccountName: string | null; notes: string[]
}> {
  const notes: string[] = []
  const window = currentWindow(dateRange)
  const prevWin = previousWindow(dateRange)
  const days = daysForRange(dateRange)

  const [overview, metaToken, shopifyToken] = await Promise.all([
    computeOverviewMetrics(clientId, dateRange).catch((err) => { notes.push(`Overview metrics unavailable: ${err.message}`); return null }),
    dbGetMetaToken(clientId),
    dbGetShopifyToken(clientId),
  ])

  const input: RuleInput = {
    days, account: null, adsets: [], ads: [], previousAds: new Map(), overview, geo: [],
  }
  const adAccountId = metaToken?.selectedAdAccountId ?? null
  const metaAccountName = (metaToken?.adAccounts ?? []).find((a: any) => a.id === adAccountId)?.name ?? null
  if (!metaToken || !adAccountId) return { input, metaAccountName, notes }
  const token = metaToken.accessToken

  const soft = <T,>(label: string, p: Promise<T>, fallback: T) =>
    p.catch((err) => { notes.push(`${label}: ${err.message}`); return fallback })

  // Deliberately few, single-page calls — see getTopActiveInsights for why.
  const [acct, adsetRows, adRows, countryRows] = await Promise.all([
    soft('Account insights', getAccountInsightsForWindow(adAccountId, token, window), null),
    soft('Ad set insights', getTopActiveInsights(adAccountId, token, window, 'adset', { limit: 100 }), [] as any[]),
    soft('Ad insights', getTopActiveInsights(adAccountId, token, window, 'ad', { limit: 150 }), [] as any[]),
    soft('Country insights', getAccountInsightsByCountry(adAccountId, token, window), [] as any[]),
  ])
  // Previous period only for fatigue candidates — the one rule that needs it.
  const fatigueIds = adRows.filter((r: any) => (parseFloat(r.frequency) || 0) >= 3.5).map((r: any) => r.ad_id).slice(0, 50)
  const prevAdRows = fatigueIds.length
    ? await soft('Previous ad insights', getTopActiveInsights(adAccountId, token, prevWin, 'ad', { ids: fatigueIds, limit: 50 }), [] as any[])
    : []

  if (acct) {
    const f = getFunnelCounts(acct)
    input.account = {
      spend: parseFloat(acct.spend) || 0,
      revenue: metaReportedRevenueOf(acct),
      purchases: maxActionCount(acct, PURCHASE_ACTION_TYPES),
      addToCart: f.addToCart,
    }
  }
  input.adsets = adsetRows.map((r: any) => summarizeMetaRow(r, 'adset'))
  input.ads = adRows.map((r: any) => summarizeMetaRow(r, 'ad'))
  input.previousAds = new Map(prevAdRows.map((r: any) => { const s = summarizeMetaRow(r, 'ad'); return [s.id, s] }))

  // Geography needs Shopify revenue by country to compare against.
  if (shopifyToken && overview?.countryBreakdown.length) {
    const revenueByName = new Map(overview.countryBreakdown.map((c) => [c.country.toLowerCase(), c]))
    const brandRoas = overview.current.mer
    const geo = countryRows
      .map((r: any) => {
        const code = String(r.country ?? '')
        const name = countryName(code)
        const shop = revenueByName.get(name.toLowerCase())
        return { code, name, metaSpend: parseFloat(r.spend) || 0, shopifyRevenue: shop?.netSales ?? 0, shopifyOrders: shop?.orders ?? 0 }
      })
      .filter((g) => g.code && g.metaSpend > 0)
      .sort((a, b) => b.metaSpend - a.metaSpend)
      .slice(0, 12)

    // Only enrich likely scale candidates (2 extra API calls each).
    const candidates = new Set(
      geo.filter((g) => g.shopifyRevenue > 0 && brandRoas > 0 && g.shopifyRevenue / g.metaSpend >= Math.max(brandRoas * 1.3, 1.5))
        .slice(0, 2).map((g) => g.code)
    )
    input.geo = await Promise.all(geo.map(async (g) => {
      if (!candidates.has(g.code)) return { ...g, topCreatives: [], topProducts: [] }
      const [ads, products] = await Promise.all([
        soft(`Top ads in ${g.name}`, getAdInsightsForCountry(adAccountId, token, window, g.code), [] as any[]),
        soft(`Top products in ${g.name}`, getTopProductsForCountry(shopifyToken.shopDomain, shopifyToken.accessToken, window, g.name, 3), []),
      ])
      const topCreatives = ads
        .map((r: any) => summarizeMetaRow(r, 'ad'))
        .filter((a: MetaRow) => a.purchases > 0)
        .sort((a: MetaRow, b: MetaRow) => b.purchases - a.purchases || b.roas - a.roas)
        .slice(0, 3)
        .map((a: MetaRow) => ({ id: a.id, name: a.name, detail: `${num(a.purchases)} purchases · ROAS ${x(a.roas)} · ${inr(a.spend)} spent` }))
      const topProducts = products.map((p) => ({ name: p.title, detail: `${inr(p.netSales)} · ${num(p.orders)} orders` }))
      return { ...g, topCreatives, topProducts }
    }))
  }

  return { input, metaAccountName, notes }
}

// ─── Orchestration + persistence ─────────────────────────────────────────────

export async function generateActionables(clientId: string, dateRange: string): Promise<ActionablesPayload> {
  const { input, metaAccountName, notes } = await gatherRuleInput(clientId, dateRange)
  const drafts = runRules(input)

  // Carry Done/Dismissed forward when the same recommendation reappears.
  const previous = await dbGetActionables(clientId).catch(() => null)
  const prevStatus = new Map((previous?.items ?? []).map((i) => [i.id, i.status]))

  const items: Actionable[] = drafts.map((d, i) => ({ ...d, rank: i + 1, status: prevStatus.get(d.id) ?? 'new' }))

  const payload: ActionablesPayload = {
    version: 2, items, dateRange, window: currentWindow(dateRange),
    clientName: await dbGetClientName(clientId), metaAccountName,
    generatedAt: new Date().toISOString(), notes,
  }
  await dbSaveActionables(clientId, payload)
  return payload
}

async function dbGetClientName(clientId: string): Promise<string | null> {
  const db = getPool()
  if (!db) return null
  const res = await db.query(`SELECT name FROM clients WHERE id = $1`, [clientId])
  return res.rows[0]?.name ?? null
}

async function dbSaveActionables(clientId: string, payload: ActionablesPayload): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO actionables (client_id, payload, generated_at) VALUES ($1, $2, $3)
     ON CONFLICT (client_id) DO UPDATE SET payload = EXCLUDED.payload, generated_at = EXCLUDED.generated_at`,
    [clientId, JSON.stringify(payload), payload.generatedAt]
  )
}

export async function dbGetActionables(clientId: string): Promise<ActionablesPayload | null> {
  const db = getPool()
  if (!db) return null
  const res = await db.query(`SELECT payload FROM actionables WHERE client_id = $1`, [clientId])
  const payload = res.rows[0]?.payload ?? null
  return payload?.version === 2 ? payload : null
}

export async function dbUpdateActionableStatus(clientId: string, id: string, status: ActionableStatus): Promise<ActionablesPayload | null> {
  const existing = await dbGetActionables(clientId)
  if (!existing) return null
  const payload = { ...existing, items: existing.items.map((i) => (i.id === id ? { ...i, status } : i)) }
  await dbSaveActionables(clientId, payload)
  return payload
}
