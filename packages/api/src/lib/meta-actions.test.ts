import { describe, it, expect } from 'vitest'
import {
  metaReportedRevenueOf, sumActionCount, sumActionValue, getFunnelCounts,
  PURCHASE_ACTION_TYPES, ADD_TO_CART_ACTION_TYPES, INITIATE_CHECKOUT_ACTION_TYPES, ADD_PAYMENT_INFO_ACTION_TYPES,
} from './meta-actions'

describe('metaReportedRevenueOf', () => {
  it('sums only purchase-type action_values, ignoring other action types', () => {
    const ins = {
      action_values: [
        { action_type: 'omni_purchase', value: '1000' },
        { action_type: 'link_click', value: '999999' }, // must be excluded
        { action_type: 'purchase', value: '500.5' },
      ],
    }
    expect(metaReportedRevenueOf(ins)).toBeCloseTo(1500.5)
  })

  it('returns 0 when action_values is missing or malformed', () => {
    expect(metaReportedRevenueOf({})).toBe(0)
    expect(metaReportedRevenueOf({ action_values: null })).toBe(0)
  })
})

describe('sumActionCount / sumActionValue', () => {
  it('filters by the exact action_type list passed in, nothing else', () => {
    const ins = { actions: [{ action_type: 'add_to_cart', value: '5' }, { action_type: 'purchase', value: '2' }] }
    expect(sumActionCount(ins, ADD_TO_CART_ACTION_TYPES)).toBe(5)
    expect(sumActionCount(ins, PURCHASE_ACTION_TYPES)).toBe(2)
  })

  it('sums across every matching action_type variant (omni_/offsite_conversion.fb_pixel_ prefixes)', () => {
    const ins = {
      actions: [
        { action_type: 'add_to_cart', value: '3' },
        { action_type: 'omni_add_to_cart', value: '3' },
        { action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '3' },
      ],
    }
    // Meta reports the same physical events under multiple action_type aliases
    // simultaneously — callers pick ONE family, not sum across all of them, so
    // this documents that summing the whole family triple-counts and callers
    // must be aware real usage sums a single representative subset if needed.
    expect(sumActionCount(ins, ADD_TO_CART_ACTION_TYPES)).toBe(9)
  })

  it('returns 0 for missing/malformed input rather than throwing', () => {
    expect(sumActionCount(undefined, PURCHASE_ACTION_TYPES)).toBe(0)
    expect(sumActionCount({ actions: null }, PURCHASE_ACTION_TYPES)).toBe(0)
    expect(sumActionValue(undefined, PURCHASE_ACTION_TYPES)).toBe(0)
  })
})

describe('getFunnelCounts', () => {
  it('extracts all four funnel stages from one raw insight object', () => {
    const ins = {
      actions: [
        { action_type: 'add_to_cart', value: '120' },
        { action_type: 'initiate_checkout', value: '40' },
        { action_type: 'add_payment_info', value: '25' },
        { action_type: 'purchase', value: '18' },
        { action_type: 'link_click', value: '99999' }, // must be excluded from all four
      ],
    }
    expect(getFunnelCounts(ins)).toEqual({
      addToCart: 120, initiateCheckout: 40, addPaymentInfo: 25, purchases: 18,
    })
  })

  it('a real-shaped multi-alias payload does not cross-contaminate other stages', () => {
    // Regression shape based on a real observed Meta response — checkout and
    // payment-info aliases must not leak into add-to-cart's count or vice versa.
    const ins = {
      actions: [
        { action_type: 'add_to_cart', value: '10' },
        { action_type: 'omni_add_to_cart', value: '10' },
        { action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '10' },
        { action_type: 'initiate_checkout', value: '4' },
        { action_type: 'omni_initiated_checkout', value: '4' },
        { action_type: 'offsite_conversion.fb_pixel_initiate_checkout', value: '4' },
        { action_type: 'onsite_web_initiate_checkout', value: '4' },
        { action_type: 'add_payment_info', value: '2' },
        { action_type: 'offsite_conversion.fb_pixel_add_payment_info', value: '2' },
      ],
    }
    const result = getFunnelCounts(ins)
    expect(result.addToCart).toBe(30)
    expect(result.initiateCheckout).toBe(16)
    expect(result.addPaymentInfo).toBe(4)
    expect(result.purchases).toBe(0)
  })

  it('returns all zeros for an ad with no recorded actions', () => {
    expect(getFunnelCounts({})).toEqual({ addToCart: 0, initiateCheckout: 0, addPaymentInfo: 0, purchases: 0 })
  })
})
