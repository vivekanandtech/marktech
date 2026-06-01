// Meta Marketing API service
// All calls go through here — swap mock data for real data per client

const GRAPH = 'https://graph.facebook.com/v20.0'
const APP_ID = process.env.META_APP_ID!
const APP_SECRET = process.env.META_APP_SECRET!
const REDIRECT_URI = process.env.META_REDIRECT_URI!

// ─── Token store (in-memory for dev, replace with DB query in production) ────
// Key: clientId, Value: { accessToken, adAccountIds, expiresAt }
export const tokenStore = new Map<string, {
  accessToken: string
  adAccountIds: string[]
  metaUserId: string
  expiresAt: number
}>()

// ─── OAuth helpers ────────────────────────────────────────────────────────────

export function getOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'ads_read',
    response_type: 'code',
    state,
  })
  return `https://www.facebook.com/v20.0/dialog/oauth?${params}`
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: APP_ID,
    client_secret: APP_SECRET,
    redirect_uri: REDIRECT_URI,
    code,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${params}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.access_token
}

export async function extendToLongLivedToken(shortToken: string): Promise<{ token: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: shortToken,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${params}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return { token: data.access_token, expiresIn: data.expires_in ?? 5184000 }
}

export async function getMetaUserId(token: string): Promise<string> {
  const res = await fetch(`${GRAPH}/me?fields=id&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.id
}

export async function getAdAccounts(token: string): Promise<{ id: string; name: string; currency: string; status: number }[]> {
  const res = await fetch(`${GRAPH}/me/adaccounts?fields=id,name,currency,account_status&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

// ─── Campaign data ────────────────────────────────────────────────────────────

export async function getCampaigns(adAccountId: string, token: string) {
  const fields = 'id,name,status,objective,daily_budget,lifetime_budget,effective_status'
  const res = await fetch(`${GRAPH}/${adAccountId}/campaigns?fields=${fields}&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

export async function getCampaignInsights(
  adAccountId: string,
  token: string,
  datePreset = 'last_30d',
  level = 'campaign'
) {
  const fields = [
    'campaign_id', 'campaign_name',
    'adset_id', 'adset_name',
    'spend', 'impressions', 'clicks', 'reach', 'frequency',
    'purchase_roas', 'cost_per_action_type',
    'cpm', 'ctr', 'cpp', 'actions',
  ].join(',')

  const params = new URLSearchParams({
    fields,
    date_preset: datePreset,
    level,
    access_token: token,
  })

  const res = await fetch(`${GRAPH}/${adAccountId}/insights?${params}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

export async function getAdSets(adAccountId: string, token: string, campaignId?: string) {
  const fields = 'id,name,campaign_id,status,daily_budget,targeting,effective_status'
  const filter = campaignId ? `&campaign_id=${campaignId}` : ''
  const res = await fetch(`${GRAPH}/${adAccountId}/adsets?fields=${fields}${filter}&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

export async function getAds(adAccountId: string, token: string) {
  const fields = 'id,name,status,adset_id,campaign_id,creative{id,title,body,thumbnail_url,image_url}'
  const res = await fetch(`${GRAPH}/${adAccountId}/ads?fields=${fields}&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

// ─── Verify a token is still valid ───────────────────────────────────────────

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const appToken = `${APP_ID}|${APP_SECRET}`
    const res = await fetch(`${GRAPH}/debug_token?input_token=${token}&access_token=${appToken}`)
    const data = await res.json() as any
    return data.data?.is_valid === true
  } catch {
    return false
  }
}
