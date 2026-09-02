// Meta's `actions`/`action_values` arrays carry every funnel event Meta
// tracks for an ad (view content, add to cart, checkout, purchase, etc.) —
// there's no way to ask the API for just one type, so every consumer has to
// filter this same raw array. Centralized here so the "which action_type
// strings count as X" list is defined exactly once, verified against a real
// account's actual data rather than guessed from Meta's docs.
export const PURCHASE_ACTION_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
export const ADD_TO_CART_ACTION_TYPES = ['add_to_cart', 'omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']
export const INITIATE_CHECKOUT_ACTION_TYPES = ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout', 'onsite_web_initiate_checkout']
export const ADD_PAYMENT_INFO_ACTION_TYPES = ['add_payment_info', 'offsite_conversion.fb_pixel_add_payment_info']

export function sumActionCount(ins: any, actionTypes: string[]): number {
  const actions = Array.isArray(ins?.actions) ? ins.actions : []
  return actions
    .filter((a: any) => actionTypes.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + (parseInt(a.value, 10) || 0), 0)
}

export function sumActionValue(ins: any, actionTypes: string[]): number {
  const values = Array.isArray(ins?.action_values) ? ins.action_values : []
  return values
    .filter((a: any) => actionTypes.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + (parseFloat(a.value) || 0), 0)
}

export function metaReportedRevenueOf(ins: any): number {
  return sumActionValue(ins, PURCHASE_ACTION_TYPES)
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
    addToCart: sumActionCount(ins, ADD_TO_CART_ACTION_TYPES),
    initiateCheckout: sumActionCount(ins, INITIATE_CHECKOUT_ACTION_TYPES),
    addPaymentInfo: sumActionCount(ins, ADD_PAYMENT_INFO_ACTION_TYPES),
    purchases: sumActionCount(ins, PURCHASE_ACTION_TYPES),
  }
}
