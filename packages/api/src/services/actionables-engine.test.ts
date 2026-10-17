import { describe, it, expect } from 'vitest'
import { runRules, inr, RuleInput, MetaRow } from './actionables-engine'
import { derivePeriodMetrics, OverviewMetricsResponse } from './metrics-engine'

const emptyChannels = {
  meta: { orders: 0, netSales: 0 }, google: { orders: 0, netSales: 0 },
  direct: { orders: 0, netSales: 0 }, organic: { orders: 0, netSales: 0 }, other: { orders: 0, netSales: 0 },
}

function period(overrides: Partial<Parameters<typeof derivePeriodMetrics>[0]> = {}) {
  return derivePeriodMetrics({
    metaSpend: 0, metaReportedRevenue: 0, googleSpend: 0, googleReportedRevenue: 0,
    channelTotals: emptyChannels, metaSessions: 0, totalSessions: 0, newCustomerCount: 0,
    newCustomerDataAvailable: false, nCACSourceApproximate: false,
    metaImpressions: 0, metaClicks: 0, googleImpressions: 0, googleClicks: 0, googleSessions: 0,
    ...overrides,
  })
}

function overview(cur = period(), extra: Partial<OverviewMetricsResponse> = {}): OverviewMetricsResponse {
  return {
    current: cur, previous: cur, deltas: {}, countryBreakdown: [],
    connected: { meta: true, google: false, shopify: true },
    platformErrors: { meta: null, google: null },
    platformStatus: { meta: 'live', google: 'not_connected' },
    ...extra,
  }
}

function row(o: Partial<MetaRow>): MetaRow {
  return {
    id: 'x', name: 'Row', campaignId: 'c1', campaignName: 'Campaign', adsetId: 'as1', adsetName: 'Ad set',
    spend: 0, revenue: 0, roas: 0, purchases: 0, costPerPurchase: 0, results: 0, costPerResult: 0,
    isPurchaseOptimised: true, ctr: 1, frequency: 1.5, impressions: 100_000, addToCart: 0, initiateCheckout: 0,
    ...o,
  }
}

// Account: ₹10L spend, ₹40L reported revenue (4.0x), 400 purchases (₹2,500 CPP), 2,000 ATC.
function input(o: Partial<RuleInput> = {}): RuleInput {
  return {
    days: 30,
    account: { spend: 1_000_000, revenue: 4_000_000, purchases: 400, addToCart: 2_000 },
    adsets: [], ads: [], previousAds: new Map(), overview: overview(), geo: [],
    ...o,
  }
}

describe('runRules — ad sets', () => {
  it('recommends a +20% budget increase for an ad set well above account ROAS', () => {
    const a = row({ id: 'win', name: 'IND | Winner', spend: 90_000, revenue: 540_000, roas: 6, purchases: 30, costPerResult: 3_000, addToCart: 120, initiateCheckout: 60 })
    const [rec] = runRules(input({ adsets: [a] }))
    expect(rec.id).toBe('scale_adset:win')
    expect(`${rec.action} - ${rec.entityName}`).toBe('Increase Budget - IND | Winner')
    expect(rec.plan?.find((p) => p.label === 'Current run-rate')?.value).toBe('₹3,000/day')
    expect(rec.plan?.find((p) => p.label === 'Recommended')?.value).toBe('₹3,600/day (+20%)')
    expect(rec.metrics.map((m) => m.label)).toEqual(['ROAS', 'Cost per result', 'Amount spent', 'Add to carts', 'Initiate checkouts', 'Frequency'])
  })

  it('steps scaling down to 15% once frequency is getting high', () => {
    const a = row({ id: 'w', spend: 90_000, revenue: 540_000, roas: 6, purchases: 30, frequency: 2.8 })
    expect(runRules(input({ adsets: [a] }))[0].plan?.[1].value).toContain('+15%')
  })

  it('says "Pause Ad Set" (critical) for meaningful spend with zero purchases', () => {
    const a = row({ id: 'dead', name: 'Dead set', spend: 60_000, purchases: 0 })
    const rec = runRules(input({ adsets: [a] }))[0]
    expect(rec.action).toBe('Pause Ad Set')
    expect(rec.severity).toBe('critical')
    expect(rec.detail).toContain('zero purchases')
  })

  it('says "Reduce Spend" for a weak-but-converting ad set', () => {
    const a = row({ id: 'weak', spend: 60_000, revenue: 120_000, roas: 2, purchases: 12, costPerPurchase: 5_000 })
    const rec = runRules(input({ adsets: [a] }))[0]
    expect(rec.action).toBe('Reduce Spend')
    expect(rec.severity).toBe('warning')
  })

  it('ignores ad sets below the significance threshold and non-purchase objectives', () => {
    const tiny = row({ id: 't', spend: 5_000, purchases: 0 })
    const reach = row({ id: 'r', spend: 90_000, purchases: 0, isPurchaseOptimised: false })
    expect(runRules(input({ adsets: [tiny, reach] }))).toHaveLength(0)
  })
})

describe('runRules — ads', () => {
  it('flags creative fatigue only with high frequency AND a real CTR drop vs the previous period', () => {
    const ad = row({ id: 'tired', name: 'Category Showcase — Carousel', spend: 40_000, revenue: 160_000, roas: 4, purchases: 16, frequency: 3.8, ctr: 1.2 })
    const prev = row({ id: 'tired', ctr: 1.6 })
    const rec = runRules(input({ ads: [ad], previousAds: new Map([['tired', prev]]) }))[0]
    expect(rec.action).toBe('Refresh Creative')
    expect(rec.detail).toContain('frequency 3.8')
    expect(rec.detail).toContain('CTR fell 25%')
  })

  it('does not call fatigue without previous-period evidence', () => {
    const ad = row({ id: 'f', spend: 40_000, revenue: 160_000, roas: 4, purchases: 16, frequency: 4.2 })
    expect(runRules(input({ ads: [ad] })).find((r) => r.type === 'creative_fatigue')).toBeUndefined()
  })
})

describe('runRules — geography (the client’s US scaling example)', () => {
  it('US at 5x vs brand 3x: take ₹40,000 to ₹60,000, worst case ~3.33x', () => {
    const ov = overview(period({ metaSpend: 1_000_000, channelTotals: { ...emptyChannels, direct: { orders: 300, netSales: 3_000_000 } } }))
    expect(ov.current.mer).toBeCloseTo(3)
    const rec = runRules(input({
      overview: ov,
      geo: [{ code: 'US', name: 'United States', metaSpend: 40_000, shopifyRevenue: 200_000, shopifyOrders: 9, topCreatives: [{ id: 'a1', name: 'US Reel', detail: '5 purchases' }], topProducts: [{ name: 'Silk Choga Set', detail: '₹80,328 · 1 orders' }] }],
    })).find((r) => r.type === 'geo_scale')!
    expect(`${rec.action} - ${rec.entityName}`).toBe('Increase Spend - United States')
    expect(rec.plan?.find((p) => p.label === 'Recommended spend')?.value).toContain('₹60,000')
    expect(rec.plan?.find((p) => p.label.startsWith('Worst-case'))?.value).toBe('3.33x')
    expect(rec.topCreatives).toHaveLength(1)
    expect(rec.topProducts?.[0].name).toBe('Silk Choga Set')
  })

  it('recommends cutting a market returning under half the brand blended ROAS', () => {
    const ov = overview(period({ metaSpend: 1_000_000, channelTotals: { ...emptyChannels, direct: { orders: 300, netSales: 3_000_000 } } }))
    const rec = runRules(input({ overview: ov, geo: [{ code: 'AU', name: 'Australia', metaSpend: 400_000, shopifyRevenue: 56_000, shopifyOrders: 3, topCreatives: [], topProducts: [] }] }))
      .find((r) => r.type === 'geo_cut')!
    expect(rec.action).toBe('Reduce Spend')
    expect(rec.entityName).toBe('Australia')
  })
})

describe('runRules — tracking & integrity', () => {
  it('puts UTM coverage first when most Shopify orders cannot be traced to ads', () => {
    const ov = overview(period({ metaSpend: 1_000_000, channelTotals: { ...emptyChannels, meta: { orders: 7, netSales: 250_000 }, other: { orders: 200, netSales: 4_000_000 } } }))
    const winner = row({ id: 'w', spend: 90_000, revenue: 540_000, roas: 6, purchases: 30 })
    const recs = runRules(input({ overview: ov, adsets: [winner] }))
    expect(recs[0].id).toBe('tracking_utm')
    expect(recs[0].detail).toContain('Only 7 of 207 Shopify orders')
  })

  it('flags a platform claiming more revenue than the whole store made', () => {
    const ov = overview(period({ metaSpend: 8_640_000, metaReportedRevenue: 34_835_200, channelTotals: { ...emptyChannels, direct: { orders: 207, netSales: 4_480_081 } } }))
    const rec = runRules(input({ overview: ov })).find((r) => r.id === 'tracking_overclaim')!
    expect(rec.detail).toContain('more than total store revenue')
  })

  it('asks to reconnect Google when its saved connection is broken', () => {
    const ov = overview(period(), { platformStatus: { meta: 'live', google: 'sync_error' } })
    expect(runRules(input({ overview: ov })).some((r) => r.id === 'google_sync')).toBe(true)
  })
})

describe('runRules — output hygiene', () => {
  it('never emits dollar amounts or unrounded ratios', () => {
    const recs = runRules(input({
      adsets: [row({ id: 'a', spend: 90_000, revenue: 540_000, roas: 6.123456, purchases: 30 }), row({ id: 'b', spend: 60_000, purchases: 0 })],
      ads: [row({ id: 'c', spend: 30_000, purchases: 0, addToCart: 5 })],
    }))
    const text = JSON.stringify(recs)
    expect(text).not.toMatch(/\$/)
    expect(text).not.toMatch(/\d\.\d{4,}/)
  })

  it('caps each rule type so the list stays decision-sized', () => {
    const many = Array.from({ length: 10 }, (_, i) => row({ id: `w${i}`, spend: 90_000 + i, revenue: 540_000, roas: 6, purchases: 30 }))
    expect(runRules(input({ adsets: many })).filter((r) => r.type === 'scale_adset')).toHaveLength(4)
  })

  it('formats rupees in Indian style', () => {
    expect(inr(3_000)).toBe('₹3,000')
    expect(inr(86_400)).toBe('₹86,400')
    expect(inr(432_000)).toBe('₹4.32L')
    expect(inr(34_835_200)).toBe('₹3.48Cr')
  })
})
