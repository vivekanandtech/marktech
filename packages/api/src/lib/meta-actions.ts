// Meta's `actions`/`action_values` arrays carry every funnel event Meta
// tracks for an ad (view content, add to cart, checkout, purchase, etc.).
// Each list below is a set of ALIASES for the same underlying event, not
// distinct additive events — confirmed live against a real account: a
// single purchase event appeared under 'purchase', 'omni_purchase', AND
// 'offsite_conversion.fb_pixel_purchase' simultaneously, each carrying the
// identical count/value (Meta's cross-device 'omni_' rollup, its legacy
// pixel-based label, and the bare type all describe the same conversion).
// Summing them previously inflated revenue/ROAS by up to 4x (confirmed:
// summing 3 identical purchase-value aliases produced 7.51x ROAS against a
// true 2.50x, matching Meta's own purchase_roas field exactly). sumAction*
// below take the MAX across matching aliases instead — correct when
// aliases overlap (the normal case), and still degrades gracefully to
// whichever single alias an account happens to report if they don't.
export const PURCHASE_ACTION_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
export const ADD_TO_CART_ACTION_TYPES = ['add_to_cart', 'omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']
export const INITIATE_CHECKOUT_ACTION_TYPES = ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout', 'onsite_web_initiate_checkout']
export const ADD_PAYMENT_INFO_ACTION_TYPES = ['add_payment_info', 'offsite_conversion.fb_pixel_add_payment_info']

export function maxActionCount(ins: any, actionTypes: string[]): number {
  const actions = Array.isArray(ins?.actions) ? ins.actions : []
  return actions
    .filter((a: any) => actionTypes.includes(a.action_type))
    .reduce((max: number, a: any) => Math.max(max, parseInt(a.value, 10) || 0), 0)
}

export function maxActionValue(ins: any, actionTypes: string[]): number {
  const values = Array.isArray(ins?.action_values) ? ins.action_values : []
  return values
    .filter((a: any) => actionTypes.includes(a.action_type))
    .reduce((max: number, a: any) => Math.max(max, parseFloat(a.value) || 0), 0)
}

export function metaReportedRevenueOf(ins: any): number {
  return maxActionValue(ins, PURCHASE_ACTION_TYPES)
}

// The four funnel-stage counts surfaced as new campaign-table columns.
export interface MetaFunnelCounts {
  addToCart: number
  initiateCheckout: number
  addPaymentInfo: number
  purchases: number
}

export function getFunnelCounts(ins: any): MetaFunnelCounts {
  return {
    addToCart: maxActionCount(ins, ADD_TO_CART_ACTION_TYPES),
    initiateCheckout: maxActionCount(ins, INITIATE_CHECKOUT_ACTION_TYPES),
    addPaymentInfo: maxActionCount(ins, ADD_PAYMENT_INFO_ACTION_TYPES),
    purchases: maxActionCount(ins, PURCHASE_ACTION_TYPES),
  }
}
