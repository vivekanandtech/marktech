import { describe, it, expect } from 'vitest'
import { mergeProductSources, applySessionFunnel } from './product-performance'
import { ProductPerformance, ProductSessionFunnel } from './shopify'
import { GoogleProductRow } from './google'

function shopifyRow(overrides: Partial<ProductPerformance> = {}): ProductPerformance {
  return { productId: 'p1', productTitle: 'Product One', netSales: 1000, orders: 2, unitsSold: 2, ...overrides }
}

function googleRow(overrides: Partial<GoogleProductRow> = {}): GoogleProductRow {
  return { productId: 'p1', productTitle: 'Product One', cost: 100, conversions: 1, conversionsValue: 300, clicks: 10, impressions: 100, ...overrides }
}

describe('mergeProductSources', () => {
  it('merges a Shopify product with its matching Google row by exact product id', () => {
    const result = mergeProductSources([shopifyRow()], [googleRow()])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      productId: 'p1', shopifyRevenue: 1000, shopifyOrders: 2, unitsSold: 2,
      googleCost: 100, googleConversions: 1, googleConversionsValue: 300,
      googleRoas: 3, hasGoogleData: true,
    })
  })

  it('keeps a Shopify-only product with zero Google fields, not dropped or faked', () => {
    const result = mergeProductSources([shopifyRow({ productId: 'p2' })], [])
    expect(result).toHaveLength(1)
    expect(result[0].hasGoogleData).toBe(false)
    expect(result[0].googleCost).toBe(0)
    expect(result[0].googleRoas).toBe(0)
  })

  it('adds an unmatched Google product as its own line rather than merging into the wrong product', () => {
    const result = mergeProductSources(
      [shopifyRow({ productId: 'p1' })],
      [googleRow({ productId: 'p2', productTitle: 'Different Product' })]
    )
    expect(result).toHaveLength(2)
    const p2 = result.find((r) => r.productId === 'p2')
    expect(p2).toMatchObject({ shopifyRevenue: 0, shopifyOrders: 0, unitsSold: 0, hasGoogleData: true, googleCost: 100 })
  })

  it('googleRoas is 0 (not Infinity/NaN) when Google cost is 0 despite conversion value existing', () => {
    const result = mergeProductSources([], [googleRow({ cost: 0, conversionsValue: 50 })])
    expect(result[0].googleRoas).toBe(0)
  })

  it('sorts by combined shopifyRevenue + googleCost, descending', () => {
    const result = mergeProductSources(
      [shopifyRow({ productId: 'low', netSales: 10 }), shopifyRow({ productId: 'high', netSales: 5000 })],
      []
    )
    expect(result.map((r) => r.productId)).toEqual(['high', 'low'])
  })

  it('every row starts with zeroed session-funnel fields, not undefined', () => {
    const result = mergeProductSources([shopifyRow()], [googleRow({ productId: 'p2' })])
    for (const row of result) {
      expect(row.sessions).toBe(0)
      expect(row.addToCart).toBe(0)
      expect(row.checkoutsInitiated).toBe(0)
    }
  })
})

describe('applySessionFunnel', () => {
  function funnel(overrides: Partial<ProductSessionFunnel> = {}): ProductSessionFunnel {
    return { sessions: 100, addToCart: 10, checkoutsInitiated: 4, ...overrides }
  }

  it('enriches a matching product in place with real session-funnel data', () => {
    const products = mergeProductSources([shopifyRow({ productId: 'p1' })], [])
    applySessionFunnel(products, { p1: funnel() })
    expect(products[0]).toMatchObject({ sessions: 100, addToCart: 10, checkoutsInitiated: 4 })
  })

  it('leaves a product with no matching funnel entry at zero, not undefined', () => {
    const products = mergeProductSources([shopifyRow({ productId: 'p1' })], [])
    applySessionFunnel(products, {})
    expect(products[0]).toMatchObject({ sessions: 0, addToCart: 0, checkoutsInitiated: 0 })
  })

  it('enriches a Google-only row too, since its productId is the real Shopify id when parseable', () => {
    const products = mergeProductSources([], [googleRow({ productId: 'p9' })])
    applySessionFunnel(products, { p9: funnel({ sessions: 50 }) })
    expect(products[0].sessions).toBe(50)
  })
})
