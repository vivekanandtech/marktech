import { describe, it, expect } from 'vitest'
import {
  sumActionCount, sumActionValue, getFunnelCounts,
  PURCHASE_ACTION_TYPES, ADD_TO_CART_ACTION_TYPES,
} from './meta-actions'

describe('sumActionCount / sumActionValue', () => {
  it('filters by the exact action_type list passed in, nothing else', () => {
    const ins = { actions: [{ action_type: 'add_to_cart', value: '5' }, { action_type: 'purchase', value: '2' }] }
    expect(sumActionCount(ins, ADD_TO_CART_ACTION_TYPES)).toBe(5)
    expect(sumActionCount(ins, PURCHASE_ACTION_TYPES)).toBe(2)
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
        { action_type: 'link_click', value: '99999' },
      ],
    }
    expect(getFunnelCounts(ins)).toEqual({
      addToCart: 120, initiateCheckout: 40, addPaymentInfo: 25, purchases: 18,
    })
  })

  it('returns all zeros for an ad with no recorded actions', () => {
    expect(getFunnelCounts({})).toEqual({ addToCart: 0, initiateCheckout: 0, addPaymentInfo: 0, purchases: 0 })
  })
})
