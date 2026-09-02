// Mirrors packages/api/src/lib/meta-actions.ts — same constants, same shape.
// Frontend and backend both need to filter Meta's raw actions/action_values
// arrays, but there's no shared package wired between them (packages/shared
// is unused), so this is the single frontend-side source of truth; the
// backend keeps its own copy in lockstep rather than duplicating the list a
// third and fourth time within each runtime.
export const PURCHASE_ACTION_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
export const ADD_TO_CART_ACTION_TYPES = ['add_to_cart', 'omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']
export const INITIATE_CHECKOUT_ACTION_TYPES = ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout', 'onsite_web_initiate_checkout']
export const ADD_PAYMENT_INFO_ACTION_TYPES = ['add_payment_info', 'offsite_conversion.fb_pixel_add_payment_info']

const safeFloat = (v: any) => { const n = parseFloat(v ?? '0'); return isFinite(n) ? n : 0 }
const safeInt   = (v: any) => { const n = parseInt(v ?? '0', 10); return isFinite(n) ? n : 0 }

export function maxActionCount(ins: any, actionTypes: string[]): number {
  const actions = Array.isArray(ins?.actions) ? ins.actions : []
  return actions
    .filter((a: any) => actionTypes.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + safeInt(a.value), 0)
}

export function maxActionValue(ins: any, actionTypes: string[]): number {
  const values = Array.isArray(ins?.action_values) ? ins.action_values : []
  return values
    .filter((a: any) => actionTypes.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + safeFloat(a.value), 0)
}

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
