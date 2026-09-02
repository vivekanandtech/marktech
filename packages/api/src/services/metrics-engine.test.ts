import { describe, it, expect } from 'vitest'
import { derivePeriodMetrics } from './metrics-engine'
import { AttributionChannel, ChannelTotals } from './shopify'

const emptyChannels: Record<AttributionChannel, ChannelTotals> = {
  meta: { orders: 0, netSales: 0 },
  google: { orders: 0, netSales: 0 },
  direct: { orders: 0, netSales: 0 },
  organic: { orders: 0, netSales: 0 },
  other: { orders: 0, netSales: 0 },
}

function baseInput(overrides: Partial<Parameters<typeof derivePeriodMetrics>[0]> = {}) {
  return {
    metaSpend: 0,
    metaReportedRevenue: 0,
    googleSpend: 0,
    googleReportedRevenue: 0,
    channelTotals: emptyChannels,
    metaSessions: 0,
    totalSessions: 0,
    newCustomerCount: 0,
    newCustomerDataAvailable: false,
    nCACSourceApproximate: false,
    ...overrides,
  }
}


describe('derivePeriodMetrics — real observed case (dohar-india, 30D window)', () => {
  it('reproduces the live-verified numbers within rounding', () => {
    const result = derivePeriodMetrics(baseInput({
      metaSpend: 3_119_456.70,
      metaReportedRevenue: 36_557_579.46,
      channelTotals: {
        ...emptyChannels,
        meta: { orders: 14, netSales: 419_455.15 },
        direct: { orders: 12, netSales: 328_784.97 },
        organic: { orders: 4, netSales: 145_581.48 },
        other: { orders: 151, netSales: 2_789_663.72 },
      },
      metaSessions: 87_993,
    }))

    expect(result.shopifyNetRevenue).toBeCloseTo(3_683_485.32, 1)
    expect(result.attributedCPR).toBeCloseTo(222_818.34, 0) // 3,119,456.70 / 14
    expect(result.mer).toBeCloseTo(1.1808, 3)               // 3,683,485.32 / 3,119,456.70
    expect(result.overClaimMultiplier).toBeCloseTo(9.9247, 3) // 36,557,579.46 / 3,683,485.32
    expect(result.blendedSpend).toBeCloseTo(3_119_456.70)
  })
})

describe('derivePeriodMetrics — division-by-zero guards', () => {
  it('attributedCPR is 0 (not Infinity/NaN) with spend but zero Meta-attributed orders', () => {
    const result = derivePeriodMetrics(baseInput({ metaSpend: 50_000 }))
    expect(result.attributedCPR).toBe(0)
    expect(Number.isFinite(result.attributedCPR)).toBe(true)
  })

  it('mer is 0 with zero blended spend, never Infinity even with real revenue', () => {
    const result = derivePeriodMetrics(baseInput({
      channelTotals: { ...emptyChannels, direct: { orders: 5, netSales: 100_000 } },
    }))
    expect(result.mer).toBe(0)
  })

  it('overClaimMultiplier is 0 with zero Shopify revenue, even with platform-claimed revenue', () => {
    const result = derivePeriodMetrics(baseInput({ metaReportedRevenue: 1_000_000 }))
    expect(result.overClaimMultiplier).toBe(0)
  })

  it('nCAC is 0 when newCustomerDataAvailable is false, regardless of newCustomerCount', () => {
    // Guards the exact bug we fixed: must not silently read as "0 CAC = free acquisition"
    // when the real reason is "couldn't fetch the data" (missing scope).
    const result = derivePeriodMetrics(baseInput({
      metaSpend: 100_000, newCustomerCount: 0, newCustomerDataAvailable: false,
    }))
    expect(result.nCAC).toBe(0)
    expect(result.newCustomerDataAvailable).toBe(false)
  })

  it('nCAC computes normally once data is available', () => {
    const result = derivePeriodMetrics(baseInput({
      metaSpend: 100_000, googleSpend: 50_000,
      newCustomerCount: 30, newCustomerDataAvailable: true,
    }))
    expect(result.nCAC).toBeCloseTo(5_000) // 150,000 / 30
  })
})

describe('derivePeriodMetrics — blending across channels', () => {
  it('blendedSpend and platformClaimedRevenue sum Meta and Google independently', () => {
    const result = derivePeriodMetrics(baseInput({
      metaSpend: 100, metaReportedRevenue: 300,
      googleSpend: 50, googleReportedRevenue: 200,
    }))
    expect(result.blendedSpend).toBe(150)
    expect(result.platformClaimedRevenue).toBe(500)
  })

  it('shopifyNetRevenue sums every channel bucket, not just meta/google', () => {
    const result = derivePeriodMetrics(baseInput({
      channelTotals: {
        meta: { orders: 1, netSales: 10 },
        google: { orders: 1, netSales: 20 },
        direct: { orders: 1, netSales: 30 },
        organic: { orders: 1, netSales: 40 },
        other: { orders: 1, netSales: 50 },
      },
    }))
    expect(result.shopifyNetRevenue).toBe(150)
  })

  it('sourceConfidence reflects the nCAC sampling flag', () => {
    expect(derivePeriodMetrics(baseInput({ nCACSourceApproximate: true })).sourceConfidence).toBe('approximate')
    expect(derivePeriodMetrics(baseInput({ nCACSourceApproximate: false })).sourceConfidence).toBe('exact')
  })
})

describe('derivePeriodMetrics — per-platform ROAS', () => {
  it('metaRoas and googleRoas use each platform\'s OWN claimed revenue, not Shopify truth', () => {
    const result = derivePeriodMetrics(baseInput({
      metaSpend: 100, metaReportedRevenue: 450,
      googleSpend: 50, googleReportedRevenue: 100,
    }))
    expect(result.metaRoas).toBeCloseTo(4.5)
    expect(result.googleRoas).toBeCloseTo(2)
  })

  it('blendedRoas is the same truth-based number as mer, just under ROAS naming', () => {
    const result = derivePeriodMetrics(baseInput({
      metaSpend: 100, googleSpend: 100,
      channelTotals: { ...emptyChannels, direct: { orders: 1, netSales: 300 } },
    }))
    expect(result.blendedRoas).toBe(result.mer)
    expect(result.blendedRoas).toBeCloseTo(1.5) // 300 / 200
  })

  it('platform ROAS is 0 (not Infinity) with zero spend on that platform', () => {
    const result = derivePeriodMetrics(baseInput({ metaReportedRevenue: 5000 }))
    expect(result.metaRoas).toBe(0)
    expect(result.googleRoas).toBe(0)
  })
})

describe('derivePeriodMetrics — conversion rate', () => {
  it('conversionRate is total orders across every channel divided by total sessions, as a percentage', () => {
    const result = derivePeriodMetrics(baseInput({
      totalSessions: 1000,
      channelTotals: {
        meta: { orders: 10, netSales: 0 },
        google: { orders: 5, netSales: 0 },
        direct: { orders: 3, netSales: 0 },
        organic: { orders: 1, netSales: 0 },
        other: { orders: 1, netSales: 0 },
      },
    }))
    expect(result.totalOrders).toBe(20)
    expect(result.conversionRate).toBeCloseTo(2) // 20/1000 * 100
  })

  it('conversionRate is 0 (not Infinity/NaN) with zero sessions', () => {
    const result = derivePeriodMetrics(baseInput({
      channelTotals: { ...emptyChannels, direct: { orders: 5, netSales: 0 } },
    }))
    expect(result.conversionRate).toBe(0)
    expect(Number.isFinite(result.conversionRate)).toBe(true)
  })
})
