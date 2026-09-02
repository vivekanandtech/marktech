import { describe, it, expect } from 'vitest'
import { parseShopifyProductId } from './google'

describe('parseShopifyProductId', () => {
  it('extracts the Shopify numeric product id from a real observed item id shape', () => {
    // Real shape observed live from shopping_performance_view on a connected account.
    expect(parseShopifyProductId('shopify_in_8285529800893_46702421115069')).toBe('8285529800893')
    expect(parseShopifyProductId('shopify_us_123_456')).toBe('123')
  })

  it('returns null for shapes that do not match the Shopify Merchant Center pattern', () => {
    // Must not guess — an unmatched item should be shown as its own line by
    // the caller, not silently (and wrongly) merged into another product.
    expect(parseShopifyProductId('online:en:IN:sku-123')).toBeNull()
    expect(parseShopifyProductId('')).toBeNull()
    expect(parseShopifyProductId('shopify_in_notanumber_456')).toBeNull()
  })
})
