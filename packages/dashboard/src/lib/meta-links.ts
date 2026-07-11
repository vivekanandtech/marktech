// Deep links into Meta Ads Manager so the agency owner can jump from a
// Marktech row straight to the matching campaign/ad set/ad for editing.
// Meta's `act=` param wants the numeric account id, not the `act_` prefix.
function stripActPrefix(adAccountId: string): string {
  return adAccountId.replace(/^act_/, '')
}

const BASE = 'https://adsmanager.facebook.com/adsmanager/manage'

export function accountManagerUrl(adAccountId: string): string {
  return `${BASE}/campaigns?act=${stripActPrefix(adAccountId)}`
}

export function campaignManagerUrl(adAccountId: string, campaignId: string): string {
  return `${BASE}/campaigns?act=${stripActPrefix(adAccountId)}&selected_campaign_ids=${campaignId}`
}

export function adsetManagerUrl(adAccountId: string, adsetId: string): string {
  return `${BASE}/adsets?act=${stripActPrefix(adAccountId)}&selected_adset_ids=${adsetId}`
}

export function adManagerUrl(adAccountId: string, adId: string): string {
  return `${BASE}/ads?act=${stripActPrefix(adAccountId)}&selected_ad_ids=${adId}`
}
