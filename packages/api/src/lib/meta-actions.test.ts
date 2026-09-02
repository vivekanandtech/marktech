import { describe, it, expect } from 'vitest'
import {
  metaReportedRevenueOf, maxActionCount, maxActionValue, getFunnelCounts,
  PURCHASE_ACTION_TYPES, ADD_TO_CART_ACTION_TYPES, INITIATE_CHECKOUT_ACTION_TYPES, ADD_PAYMENT_INFO_ACTION_TYPES,
} from './meta-actions'

describe('metaReportedRevenueOf', () => {
  it('takes the max across purchase-type action_values, ignoring other action types', () => {
    const ins = {
      action_values: [
        { action_type: 'omni_purchase', value: '1000' },
        { action_type: 'link_click', value: '999999' }, // must be excluded
        { action_type: 'purchase', value: '500.5' },
      ],
    }
    // NOT 1500.5 — omni_purchase and purchase aren't distinct revenue, they're
    // two labels Meta can attach to the same conversion. Summing would have
    // double-counted here; max picks the larger of the two reported figures.
    expect(metaReportedRevenueOf(ins)).toBeCloseTo(1000)
  })

  it('returns 0 when action_values is missing or malformed', () => {
    expect(metaReportedRevenueOf({})).toBe(0)
    expect(metaReportedRevenueOf({ action_values: null })).toBe(0)
  })
})

describe('maxActionCount / maxActionValue', () => {
  it('filters by the exact action_type list passed in, nothing else', () => {
    const ins = { actions: [{ action_type: 'add_to_cart', value: '5' }, { action_type: 'purchase', value: '2' }] }
    expect(maxActionCount(ins, ADD_TO_CART_ACTION_TYPES)).toBe(5)
    expect(maxActionCount(ins, PURCHASE_ACTION_TYPES)).toBe(2)
  })

  it('takes the max across matching action_type aliases instead of summing them', () => {
    // Confirmed live against a real Meta account: 'add_to_cart',
    // 'omni_add_to_cart', and 'offsite_conversion.fb_pixel_add_to_cart' all
    // reported the IDENTICAL value simultaneously for the same underlying
    // event — Meta's cross-device rollup, its legacy pixel label, and the
    // bare type describing one conversion, not three. Summing previously
    // inflated this 3x (and inflated real Meta revenue/ROAS up to 4x for
    // the initiate_checkout family, which has 4 aliases).
    const ins = {
      actions: [
        { action_type: 'add_to_cart', value: '3' },
        { action_type: 'omni_add_to_cart', value: '3' },
        { action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '3' },
      ],
    }
    expect(maxActionCount(ins, ADD_TO_CART_ACTION_TYPES)).toBe(3)
  })

  it('returns 0 for missing/malformed input rather than throwing', () => {
    expect(maxActionCount(undefined, PURCHASE_ACTION_TYPES)).toBe(0)
    expect(maxActionCount({ actions: null }, PURCHASE_ACTION_TYPES)).toBe(0)
    expect(maxActionValue(undefined, PURCHASE_ACTION_TYPES)).toBe(0)
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

  it('a real-shaped multi-alias payload does not cross-contaminate other stages, and does not multiply within one', () => {
    // Regression shape taken from a real observed Meta response — checkout and
    // payment-info aliases must not leak into add-to-cart's count (cross-stage
    // contamination), AND the aliases within one stage must not multiply the
    // count (this used to sum 10+10+10=30 for a single real add-to-cart event).
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
    expect(result.addToCart).toBe(10)
    expect(result.initiateCheckout).toBe(4)
    expect(result.addPaymentInfo).toBe(2)
    expect(result.purchases).toBe(0)
  })

  it('returns all zeros for an ad with no recorded actions', () => {
    expect(getFunnelCounts({})).toEqual({ addToCart: 0, initiateCheckout: 0, addPaymentInfo: 0, purchases: 0 })
  })
})
