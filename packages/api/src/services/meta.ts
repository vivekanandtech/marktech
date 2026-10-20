import { getPool } from '../lib/db'
import { previousWindow } from '../lib/dateWindows'
import { cachedMetaFetch, isRateLimitError } from '../lib/response-cache'

const GRAPH = 'https://graph.facebook.com/v20.0'
const APP_ID = process.env.META_APP_ID!
const APP_SECRET = process.env.META_APP_SECRET!
const REDIRECT_URI = process.env.META_REDIRECT_URI!

// ─── In-memory token store (fast path — populated on OAuth and on DB reads) ───
export const tokenStore = new Map<string, {
  accessToken: string
  adAccountIds: string[]
  adAccounts: Array<{ id: string; name: string; currency: string; business?: any }>
  metaUserId: string
  expiresAt: number
}>()

// ─── DB-backed token persistence ─────────────────────────────────────────────

export async function dbSaveToken(clientId: string, data: {
  accessToken: string
  metaUserId: string
  adAccountIds: string[]
  adAccounts?: any[]        // full objects: { id, name, currency }
  expiresAt: number         // Unix ms
}): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO meta_tokens
       (client_id, access_token, meta_user_id, ad_account_ids, ad_accounts_json, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6), NOW())
     ON CONFLICT (client_id) DO UPDATE SET
       access_token     = EXCLUDED.access_token,
       meta_user_id     = EXCLUDED.meta_user_id,
       ad_account_ids   = EXCLUDED.ad_account_ids,
       ad_accounts_json = EXCLUDED.ad_accounts_json,
       expires_at       = EXCLUDED.expires_at,
       updated_at       = NOW()`,
    [
      clientId,
      data.accessToken,
      data.metaUserId,
      data.adAccountIds,
      data.adAccounts ? JSON.stringify(data.adAccounts) : null,
      data.expiresAt / 1000,
    ]
  )
}

export async function dbUpdateSelectedAccount(clientId: string, adAccountId: string): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `UPDATE meta_tokens SET selected_ad_account_id = $2, updated_at = NOW() WHERE client_id = $1`,
    [clientId, adAccountId]
  )
}

// Refreshes the cached ad account list after a live re-fetch (see /meta/status)
// so a newly-granted ad account in Meta Business Manager persists across
// server restarts instead of only living in that one request's response.
export async function dbUpdateAdAccounts(clientId: string, adAccounts: any[]): Promise<void> {
  const existing = tokenStore.get(clientId)
  if (existing) tokenStore.set(clientId, { ...existing, adAccounts, adAccountIds: adAccounts.map((a) => a.id) })

  const db = getPool()
  if (!db) return
  await db.query(
    `UPDATE meta_tokens SET ad_account_ids = $2, ad_accounts_json = $3, updated_at = NOW() WHERE client_id = $1`,
    [clientId, adAccounts.map((a) => a.id), JSON.stringify(adAccounts)]
  )
}

// Meta silently extends a long-lived token's expiry as it's used, so the
// expires_at saved at OAuth time goes stale — and anything that trusted it
// (it used to filter dbGetToken) treated a perfectly valid token as gone.
// Called with Meta's own debug_token answer whenever we validate live.
export async function dbUpdateTokenExpiry(clientId: string, expiresAt: number): Promise<void> {
  const existing = tokenStore.get(clientId)
  if (existing) tokenStore.set(clientId, { ...existing, expiresAt })

  const db = getPool()
  if (!db) return
  await db.query(
    `UPDATE meta_tokens SET expires_at = to_timestamp($2), updated_at = NOW() WHERE client_id = $1`,
    [clientId, expiresAt / 1000]
  )
}

// Permanently removes a client's Meta connection. Used by both the explicit
// "Disconnect" action and client deletion — without this, a removed client
// resurfaces on the next session-discovery pass because the DB row survives.
export async function dbDeleteToken(clientId: string): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(`DELETE FROM meta_tokens WHERE client_id = $1`, [clientId])
}

export async function dbGetToken(clientId: string): Promise<{
  accessToken: string
  metaUserId: string
  adAccountIds: string[]
  adAccounts: any[]
  selectedAdAccountId: string | null
  expiresAt: number
} | null> {
  const db = getPool()
  if (!db) return null
  const result = await db.query(
    `SELECT access_token, meta_user_id, ad_account_ids, ad_accounts_json,
            selected_ad_account_id,
            extract(epoch from expires_at) * 1000 AS expires_ms
     FROM meta_tokens
     WHERE client_id = $1`,
    [clientId]
  )
  if (!result.rows[0]) return null
  const row = result.rows[0]
  return {
    accessToken:           row.access_token,
    metaUserId:            row.meta_user_id,
    adAccountIds:          row.ad_account_ids ?? [],
    adAccounts:            row.ad_accounts_json ?? [],
    selectedAdAccountId:   row.selected_ad_account_id ?? null,
    expiresAt:             Number(row.expires_ms),
  }
}

export async function dbGetAllSessions(): Promise<Array<{
  clientId: string
  metaUserId: string
  adAccounts: any[]
  adAccountIds: string[]
  selectedAdAccountId: string | null
  accessToken: string
  expiresAt: number
}>> {
  const db = getPool()
  if (!db) return []
  // DISTINCT ON (meta_user_id) collapses duplicate rows from repeated OAuth
  // flows by the same Meta user — keeps only the most-recently-updated row.
  const result = await db.query(
    `SELECT DISTINCT ON (meta_user_id)
            client_id, meta_user_id, ad_accounts_json, ad_account_ids,
            selected_ad_account_id, access_token,
            extract(epoch from expires_at) * 1000 AS expires_ms
     FROM meta_tokens
     ORDER BY meta_user_id, updated_at DESC`
  )
  return result.rows.map((row) => ({
    clientId:             row.client_id,
    metaUserId:           row.meta_user_id,
    adAccounts:           row.ad_accounts_json ?? [],
    adAccountIds:         row.ad_account_ids ?? [],
    selectedAdAccountId:  row.selected_ad_account_id ?? null,
    accessToken:          row.access_token,
    expiresAt:            Number(row.expires_ms),
  }))
}

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

export async function getAdAccounts(token: string): Promise<{
  id: string
  name: string
  currency: string
  status: number
  business?: { id: string; name: string } | null
}[]> {
  // Note: `business{id,name}` requires the `business_management` permission,
  // which this app does not request (ads_read is sufficient) — omit it.
  const res = await fetch(`${GRAPH}/me/adaccounts?fields=id,name,currency,account_status&access_token=${token}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

// ─── Campaign data ────────────────────────────────────────────────────────────

// Rolling-window lengths for each UI date range option. Meta's `date_preset`
// values don't cover arbitrary ranges like "last 3 months", so we always
// compute an explicit `time_range` instead.
const DAYS_MAP: Record<string, number> = {
  '1D': 1, '3D': 3, '7D': 7, '14D': 14, '30D': 30, '3M': 90, '6M': 180, '1Y': 365,
}

function toTimeRange(dateRange: string): { since: string; until: string } {
  const days = DAYS_MAP[dateRange] ?? 30
  const until = new Date()
  const since = new Date(until)
  since.setDate(since.getDate() - (days - 1))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { since: fmt(since), until: fmt(until) }
}

// results/cost_per_result are Ads Manager's own "Results" column — keyed to
// each campaign/ad set's optimization event (purchases, reach, leads...).
// Meta silently omits them at account level, where objectives are mixed.
export const BASE_INSIGHT_FIELDS = [
  'spend', 'impressions', 'clicks', 'reach', 'frequency',
  'purchase_roas', 'cost_per_action_type',
  'cpm', 'ctr', 'cpp', 'actions', 'action_values',
  'results', 'cost_per_result',
]

// Fields needed to classify a creative as video/carousel/image and render a
// thumbnail. Verified live against this account's real ads: `video_id` is
// NOT reliably present at the top level (it lives under
// object_story_spec.video_data instead), and this account's multi-asset ads
// use Advantage+ `asset_feed_spec.videos/images` rather than the classic
// `link_data.child_attachments` carousel shape — both must be checked.
export const CREATIVE_FIELDS = [
  'id', 'thumbnail_url', 'image_url', 'image_hash', 'video_id', 'object_type',
  'effective_object_story_id',
  'object_story_spec{link_data{picture,link,child_attachments},photo_data{images},video_data{image_url,video_id}}',
  'asset_feed_spec{videos,images}',
].join(',')

// Lighter subset of CREATIVE_FIELDS for getCampaignDetail's ad-level drill-down,
// which can request hundreds of ads in one campaign (unlike getTopAds' fixed
// small N). classifyCreativeFormat + transformMetaAd's thumbnail fallback only
// ever read the fields below — id/image_hash/effective_object_story_id/
// photo_data{images}/link_data.picture/link/video_data.image_url are all only
// used by getTopAds' pickBestImage hash-resolution path. Confirmed live: even
// after cutting the ads page limit from 200->50, the full CREATIVE_FIELDS set
// still tripped Meta's "reduce the amount of data" complexity error on a
// 260-ad campaign — the per-ad field weight, not just the page size, was the
// problem.
export const AD_DRILLDOWN_CREATIVE_FIELDS = [
  'thumbnail_url', 'image_url', 'video_id', 'object_type',
  'object_story_spec{link_data{child_attachments},video_data{video_id}}',
  'asset_feed_spec{videos,images}',
].join(',')

// Only request the id/name fields for the level being queried. Requesting
// e.g. ad_id/ad_name at level=campaign makes Meta return one row per ad
// (each with only that ad's slice of spend) instead of one aggregated row
// per campaign, which broke the campaign_id-keyed insight lookup.
const LEVEL_FIELDS: Record<string, string[]> = {
  campaign: ['campaign_id', 'campaign_name', ...BASE_INSIGHT_FIELDS],
  adset:    ['adset_id', 'adset_name', 'campaign_id', 'campaign_name', ...BASE_INSIGHT_FIELDS],
  ad:       ['ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', ...BASE_INSIGHT_FIELDS],
}

// Follow Meta's cursor-based pagination until all rows are fetched.
async function fetchAllPages(url: string): Promise<any[]> {
  const all: any[] = []
  let next: string | null = url
  while (next) {
    const res = await fetch(next)
    const data = await res.json() as any
    if (data.error) throw new Error(data.error.message)
    all.push(...(data.data ?? []))
    next = data.paging?.next ?? null
  }
  return all
}

// Campaign / ad set / ad *structure* (names, status, budget, targeting) has
// its own small Meta read allowance on the development tier, separate from
// performance insights — a large account (925 campaigns) exhausts it and Meta
// then refuses even an id,name listing (#17 "User request limit reached")
// while insights still load. Structure changes rarely, so it's cached for 30
// minutes; null means Meta refused and nothing is saved, and callers fall back
// to the names carried on insights rows rather than showing an error.
const STRUCTURE_TTL_MS = 30 * 60 * 1000

async function getStructure(key: string, url: string): Promise<any[] | null> {
  try {
    const { rows } = await cachedMetaFetch(key, STRUCTURE_TTL_MS, async () => ({ rows: await fetchAllPages(url) }))
    return rows
  } catch (err) {
    if (isRateLimitError(err)) return null
    throw err
  }
}

export async function getCampaigns(adAccountId: string, token: string): Promise<any[] | null> {
  const fields = 'id,name,status,objective,daily_budget,lifetime_budget,effective_status'
  return getStructure(`meta:structure:campaigns:${adAccountId}`, `${GRAPH}/${adAccountId}/campaigns?fields=${fields}&limit=200&access_token=${token}`)
}

export async function getCampaignInsights(
  adAccountId: string,
  token: string,
  dateRange = '30D',
  level = 'campaign'
) {
  return getCampaignInsightsForWindow(adAccountId, token, toTimeRange(dateRange), level)
}

// Same as getCampaignInsights but for an explicit {since, until} window — used
// to fetch a "previous period" for trend comparisons.
export async function getCampaignInsightsForWindow(
  adAccountId: string,
  token: string,
  window: { since: string; until: string },
  level = 'campaign'
) {
  const fields = (LEVEL_FIELDS[level] ?? LEVEL_FIELDS.campaign).join(',')
  const params = new URLSearchParams({
    fields,
    time_range: JSON.stringify(window),
    level,
    limit: '200',
    access_token: token,
  })
  return fetchAllPages(`${GRAPH}/${adAccountId}/insights?${params}`)
}

// Single account-level insight row — gives true account totals matching what
// Meta Ads Manager shows, regardless of how many campaigns the account has.
export async function getAccountInsights(adAccountId: string, token: string, dateRange = '30D') {
  return getAccountInsightsForWindow(adAccountId, token, toTimeRange(dateRange))
}

// Same as getAccountInsights but for an explicit {since, until} window — used
// to fetch a "previous period" that toTimeRange (always relative to today)
// can't express, e.g. for period-over-period comparisons in the metrics engine.
export async function getAccountInsightsForWindow(
  adAccountId: string, token: string, window: { since: string; until: string }
) {
  const params = new URLSearchParams({
    fields: BASE_INSIGHT_FIELDS.join(','),
    time_range: JSON.stringify(window),
    level: 'account',
    access_token: token,
  })
  const res = await fetch(`${GRAPH}/${adAccountId}/insights?${params}`)
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return (data.data ?? [])[0] ?? null
}

// Insights for every child (ad set or ad) under one parent, keyed by child id,
// for an explicit window. Uses the insights edge rather than nesting
// insights{...} inside the object listing: verified live that Meta ignores a
// top-level time_range for nested insights and always returns last_30d, so
// the drill-down silently ignored the date picker and its rows didn't add up
// to the campaign total.
async function getChildInsightsForWindow(
  parentId: string, token: string, level: 'adset' | 'ad', window: { since: string; until: string }
): Promise<Map<string, any>> {
  const params = new URLSearchParams({
    fields: LEVEL_FIELDS[level].join(','),
    time_range: JSON.stringify(window),
    level,
    limit: '500',
    access_token: token,
  })
  const rows = await fetchAllPages(`${GRAPH}/${parentId}/insights?${params}`)
  const idKey = level === 'adset' ? 'adset_id' : 'ad_id'
  return new Map(rows.map((r: any) => [r[idKey], r]))
}

// Fetch a single campaign's ad sets with their insights (current + previous
// window). Uses the /{campaignId}/ edge so queries are scoped to that one
// campaign — no global pagination problem regardless of account size.
export async function getCampaignDetail(
  campaignId: string,
  token: string,
  dateRange = '30D'
): Promise<{ adSets: any[]; partial: boolean }> {
  // ads.limit(0).summary(true) returns each ad set's ad count inline — no
  // separate call paging through every ad in the campaign just to count them,
  // which on large accounts was a big share of Meta's request allowance.
  const adsetFields = 'id,name,campaign_id,status,daily_budget,targeting,effective_status,optimization_goal,ads.limit(0).summary(true)'

  const ADSET_PAGE_LIMIT = 200

  // Ads are lazy-loaded per ad set on expand (see getAdSetAdsDetail) rather
  // than fetched eagerly here: on a 260-ad campaign that tripped Meta's
  // development-tier ads_insights budget every time.
  const emptyMap = async () => new Map<string, any>()
  const [adsets, insights, prevInsights] = await Promise.all([
    getStructure(`meta:structure:adsets:${campaignId}`, `${GRAPH}/${campaignId}/adsets?fields=${adsetFields}&limit=${ADSET_PAGE_LIMIT}&access_token=${token}`),
    getChildInsightsForWindow(campaignId, token, 'adset', toTimeRange(dateRange)),
    getChildInsightsForWindow(campaignId, token, 'adset', previousWindow(dateRange)).catch(emptyMap),
  ])

  // Structure refused: build rows from the insights (name + metrics for every
  // ad set that delivered); status/targeting/ad count are unknown.
  if (!adsets) {
    return {
      partial: true,
      adSets: [...insights.values()].map((r: any) => ({
        id: r.adset_id, name: r.adset_name, campaign_id: r.campaign_id,
        insights: r, previousInsights: prevInsights.get(r.adset_id) ?? null,
        ads: [], adCount: null,
      })),
    }
  }

  return {
    partial: false,
    adSets: adsets.map((as: any) => ({
      ...as,
      insights: insights.get(as.id) ?? null,
      previousInsights: prevInsights.get(as.id) ?? null,
      ads: [],
      adCount: as.ads?.summary?.total_count ?? 0,
    })),
  }
}

// Fetch one ad set's ads + insights (current and previous window), lazily
// loaded when a user expands that specific ad set in the UI. Scoping to a
// single ad set (typically a handful of ads) keeps this well under Meta's
// ads_insights usage budget even for accounts stuck on development access
// tier — see getCampaignDetail's comment for why the equivalent
// whole-campaign fetch had to be removed.
export async function getAdSetAdsDetail(
  adSetId: string,
  token: string,
  dateRange = '30D'
): Promise<{ ads: any[]; partial: boolean }> {
  const adFields = `id,name,status,adset_id,campaign_id,effective_status,creative{${AD_DRILLDOWN_CREATIVE_FIELDS}}`
  const emptyMap = async () => new Map<string, any>()

  const [ads, insights, prevInsights] = await Promise.all([
    getStructure(`meta:structure:ads:${adSetId}`, `${GRAPH}/${adSetId}/ads?fields=${adFields}&limit=200&access_token=${token}`),
    getChildInsightsForWindow(adSetId, token, 'ad', toTimeRange(dateRange)),
    getChildInsightsForWindow(adSetId, token, 'ad', previousWindow(dateRange)).catch(emptyMap),
  ])

  if (!ads) {
    return {
      partial: true,
      ads: [...insights.values()].map((r: any) => ({
        id: r.ad_id, name: r.ad_name, adset_id: r.adset_id, campaign_id: r.campaign_id,
        insights: r, previousInsights: prevInsights.get(r.ad_id) ?? null,
      })),
    }
  }

  return {
    partial: false,
    ads: ads.map((ad: any) => ({
      ...ad,
      insights: insights.get(ad.id) ?? null,
      previousInsights: prevInsights.get(ad.id) ?? null,
    })),
  }
}

// ─── Large-account fallback for ad-level queries ────────────────────────────
// Verified live on a 2,000+-ad account: Meta gives up on account-wide ad-level
// insights over multi-day windows ("Service temporarily unavailable", code 2 /
// subcode 1504043) — even as an async report — while the same query scoped to
// one campaign succeeds in a few seconds. So on that error, query campaign by
// campaign and merge; accounts known to fail skip the doomed attempt for 6h.
export function isHeavyQueryError(err: any): boolean {
  return /temporarily unavailable|reduce the amount of data|took too long|timed? ?out/i.test(err?.message ?? '')
}

const heavyAccounts = new Map<string, number>()
const HEAVY_MEMORY_MS = 6 * 60 * 60 * 1000
const isKnownHeavy = (adAccountId: string) => (heavyAccounts.get(adAccountId) ?? 0) > Date.now()

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]) }
  }))
  return out
}

const SPEND_FILTER = { field: 'spend', operator: 'GREATER_THAN', value: 0 }

export interface SpendUnit { id: string; name: string; spend: number; level: 'campaign' | 'adset' }

// Campaigns (or one campaign's ad sets) with spend in the window, biggest first.
async function getSpendingUnits(
  parentId: string, token: string, window: { since: string; until: string }, level: 'campaign' | 'adset'
): Promise<SpendUnit[]> {
  const params = new URLSearchParams({
    fields: `${level}_id,${level}_name,spend`, level, time_range: JSON.stringify(window),
    filtering: JSON.stringify([SPEND_FILTER]), limit: '500', access_token: token,
  })
  const rows = await fetchAllPages(`${GRAPH}/${parentId}/insights?${params}`)
  return rows
    .map((r: any) => ({ id: r[`${level}_id`], name: r[`${level}_name`], spend: parseFloat(r.spend) || 0, level }))
    .sort((a: SpendUnit, b: SpendUnit) => b.spend - a.spend)
}

async function getSpendingCampaignIds(adAccountId: string, token: string, window: { since: string; until: string }): Promise<string[]> {
  return (await getSpendingUnits(adAccountId, token, window, 'campaign')).map((u) => u.id)
}

// Ad-level rows scoped to each campaign (4 at a time). A campaign Meta still
// refuses (after one retry — Meta flags these as transient) is fetched ad set
// by ad set, which has held up even when the campaign query didn't. Anything
// still refused is reported in `missing`, never silently dropped.
async function getAdInsightsPerCampaign(
  campaignIds: string[], token: string, window: { since: string; until: string },
  opts: { filtering?: any[]; units?: SpendUnit[] } = {}
): Promise<{ rows: any[]; missing: SpendUnit[] }> {
  const filtering = JSON.stringify(opts.filtering ?? [SPEND_FILTER])
  const adRows = (parentId: string) => fetchAllPages(`${GRAPH}/${parentId}/insights?${new URLSearchParams({
    fields: LEVEL_FIELDS.ad.join(','), level: 'ad', time_range: JSON.stringify(window),
    filtering, limit: '500', access_token: token,
  })}`)
  const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn() } catch { return fn() }
  }
  const unitFor = (id: string): SpendUnit => opts.units?.find((u) => u.id === id) ?? { id, name: id, spend: 0, level: 'campaign' }
  const missing: SpendUnit[] = []

  const results = await mapLimit(campaignIds, 4, async (campaignId) => {
    try { return await withRetry(() => adRows(campaignId)) }
    catch (err: any) {
      console.warn(`[meta] campaign ${campaignId} refused (${err.message}) — fetching per ad set`)
      try {
        const adsets = await withRetry(() => getSpendingUnits(campaignId, token, window, 'adset'))
        const perAdset = await mapLimit(adsets, 4, async (as) => {
          try { return await withRetry(() => adRows(as.id)) }
          catch { missing.push(as); return [] as any[] }
        })
        return perAdset.flat()
      } catch {
        missing.push(unitFor(campaignId))
        return [] as any[]
      }
    }
  })
  return { rows: results.flat(), missing }
}

async function withCampaignFallback<T>(adAccountId: string, accountWide: () => Promise<T>, perCampaign: () => Promise<T>): Promise<T> {
  if (isKnownHeavy(adAccountId)) return perCampaign()
  try {
    return await accountWide()
  } catch (err) {
    if (!isHeavyQueryError(err)) throw err
    heavyAccounts.set(adAccountId, Date.now() + HEAVY_MEMORY_MS)
    console.warn(`[meta] ${adAccountId}: account-wide ad query too heavy for Meta — querying per campaign`)
    return perCampaign()
  }
}

// Every ad with spend in the window, with its campaign/ad set names and the
// full insight field set. Backs the Excel export; `missing` lists any campaign
// or ad set Meta wouldn't return, so the export can say so.
export async function getAdLevelInsightsForWindow(
  adAccountId: string, token: string, window: { since: string; until: string }
): Promise<{ rows: any[]; missing: SpendUnit[] }> {
  return withCampaignFallback(
    adAccountId,
    async () => ({
      rows: await fetchAllPages(`${GRAPH}/${adAccountId}/insights?${new URLSearchParams({
        fields: LEVEL_FIELDS.ad.join(','), time_range: JSON.stringify(window), level: 'ad', limit: '500',
        filtering: JSON.stringify([SPEND_FILTER]), access_token: token,
      })}`),
      missing: [],
    }),
    async () => {
      const units = await getSpendingUnits(adAccountId, token, window, 'campaign')
      return getAdInsightsPerCampaign(units.map((u) => u.id), token, window, { units })
    },
  )
}

// The top-spending, currently-delivering ad sets or ads in ONE page. Built for
// accounts on Meta's development access tier, whose small ads_insights budget
// a full paginated ad-level pull (current + previous period) exhausts — the
// whole account then gets throttled for ~an hour. Filtering to ACTIVE also
// keeps paused objects out: recommending "pause" for something already paused
// is the fastest way to lose a CMO's trust.
export async function getTopActiveInsights(
  adAccountId: string, token: string, window: { since: string; until: string },
  level: 'adset' | 'ad', opts: { limit?: number; ids?: string[] } = {}
): Promise<any[]> {
  const filtering: any[] = [{ field: 'spend', operator: 'GREATER_THAN', value: 0 }]
  if (opts.ids) filtering.push({ field: `${level}.id`, operator: 'IN', value: opts.ids })
  else filtering.push({ field: `${level}.effective_status`, operator: 'IN', value: ['ACTIVE'] })
  const params = new URLSearchParams({
    fields: LEVEL_FIELDS[level].join(','),
    time_range: JSON.stringify(window),
    level,
    sort: JSON.stringify(['spend_descending']),
    limit: String(opts.limit ?? 150),
    filtering: JSON.stringify(filtering),
    access_token: token,
  })
  const accountWide = async () => {
    const res = await fetch(`${GRAPH}/${adAccountId}/insights?${params}`, { signal: AbortSignal.timeout(45_000) })
    const data = await res.json() as any
    if (data.error) throw new Error(data.error.message)
    return (data.data ?? []) as any[]
  }
  // Ad level on a large account: fall back to the top-spending campaigns.
  if (level !== 'ad' || opts.ids) return accountWide()
  const rows = await withCampaignFallback(adAccountId, accountWide, async () =>
    (await getAdInsightsPerCampaign((await getSpendingCampaignIds(adAccountId, token, window)).slice(0, 12), token, window, { filtering })).rows)
  return rows
    .sort((a: any, b: any) => parseFloat(b.spend) - parseFloat(a.spend))
    .slice(0, opts.limit ?? 150)
}

// Account spend/revenue split by delivery country (ISO-2 code in `country`).
export async function getAccountInsightsByCountry(
  adAccountId: string, token: string, window: { since: string; until: string }
): Promise<any[]> {
  const params = new URLSearchParams({
    fields: BASE_INSIGHT_FIELDS.join(','),
    time_range: JSON.stringify(window),
    level: 'account',
    breakdowns: 'country',
    limit: '500',
    access_token: token,
  })
  return fetchAllPages(`${GRAPH}/${adAccountId}/insights?${params}`)
}

// Top-spending ads in one country, with that country's slice of their metrics.
export async function getAdInsightsForCountry(
  adAccountId: string, token: string, window: { since: string; until: string }, countryCode: string
): Promise<any[]> {
  const params = new URLSearchParams({
    fields: LEVEL_FIELDS.ad.join(','),
    time_range: JSON.stringify(window),
    level: 'ad',
    breakdowns: 'country',
    sort: JSON.stringify(['spend_descending']),
    limit: '50',
    filtering: JSON.stringify([
      { field: 'spend', operator: 'GREATER_THAN', value: 0 },
      { field: 'country', operator: 'IN', value: [countryCode] },
    ]),
    access_token: token,
  })
  const res = await fetch(`${GRAPH}/${adAccountId}/insights?${params}`, { signal: AbortSignal.timeout(45_000) })
  const data = await res.json() as any
  if (data.error) throw new Error(data.error.message)
  return data.data ?? []
}

export async function getAdLevelInsights(adAccountId: string, token: string, dateRange = '30D'): Promise<{ rows: any[]; missing: SpendUnit[] }> {
  return getAdLevelInsightsForWindow(adAccountId, token, toTimeRange(dateRange))
}

// Pick the highest-quality image URL available in a creative object.
// Priority:
//   1. adimages permalink (full-res, fetched separately via image_hash)
//   2. object_story_spec.link_data.picture (good quality for link/image ads)
//   3. object_story_spec.video_data.image_url (video ad custom thumbnail)
//   4. object_story_spec.photo_data.images (photo ads)
//   5. image_url / thumbnail_url (low-res fallbacks)
function pickBestImage(cr: any, hashUrlMap: Record<string, string> = {}): string {
  if (cr.image_hash && hashUrlMap[cr.image_hash]) return hashUrlMap[cr.image_hash]

  const ldPicture = cr.object_story_spec?.link_data?.picture
  if (ldPicture) return ldPicture

  const vdImage = cr.object_story_spec?.video_data?.image_url
  if (vdImage) return vdImage

  const pdImages = cr.object_story_spec?.photo_data?.images
  if (pdImages && typeof pdImages === 'object') {
    const preferred = pdImages['standard'] ?? pdImages['maximum'] ?? Object.values(pdImages)[0] as any
    if (preferred?.url) return preferred.url
  }

  return cr.image_url ?? cr.thumbnail_url ?? ''
}

// Build a clickable preview URL for the ad.
// effective_object_story_id is a {page_id}_{post_id} string that maps to
// a real Facebook post the user can view without needing Ads Manager access.
function buildPreviewUrl(cr: any): string {
  const storyId = cr.effective_object_story_id
  if (storyId) return `https://www.facebook.com/${storyId}`
  const link = cr.object_story_spec?.link_data?.link
  if (link) return link
  return ''
}

// Top ads for the Creatives page — 2-step approach to avoid Meta's
// "reduce the amount of data" error from embedding insights in the ads query:
// 1. Fetch ad-level insights from the dedicated insights endpoint (lightweight).
// 2. Batch-fetch creative details only for the top N ad IDs.
export async function getTopAds(adAccountId: string, token: string, limit = 25): Promise<any[]> {
  const safeLimit = Math.min(limit, 25)   // hard cap — >25 in one batch triggers Meta's data limit
  const { since, until } = toTimeRange('30D')
  const insightFields = [
    'ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'reach',
    'purchase_roas', 'ctr', 'cpm', 'frequency', 'actions', 'action_values',
  ].join(',')

  // Step 1 — the top N ads by spend. Meta sorts and filters server-side (the
  // old code took an arbitrary first page of 75 ads and ranked only those).
  // Large accounts fall back to their top-spending campaigns, which is where
  // the account's top-spending ads are.
  const window = { since, until }
  const rows = await withCampaignFallback(
    adAccountId,
    async () => {
      const insightParams = new URLSearchParams({
        fields: insightFields,
        time_range: JSON.stringify(window),
        level: 'ad',
        sort: JSON.stringify(['spend_descending']),
        filtering: JSON.stringify([SPEND_FILTER]),
        limit: String(safeLimit),
        access_token: token,
      })
      const insRes = await fetch(`${GRAPH}/${adAccountId}/insights?${insightParams}`)
      const insData = await insRes.json() as any
      if (insData.error) throw new Error(insData.error.message)
      return (insData.data ?? []) as any[]
    },
    async () => (await getAdInsightsPerCampaign((await getSpendingCampaignIds(adAccountId, token, window)).slice(0, 12), token, window)).rows,
  )
  const topInsights = rows
    .sort((a, b) => parseFloat(b.spend ?? '0') - parseFloat(a.spend ?? '0'))
    .slice(0, safeLimit)

  if (topInsights.length === 0) return []

  // Step 2 — batch creative details in chunks of 10.
  // We request image_hash + object_story_spec (including video_data) so we can
  // resolve full-resolution images in step 3.
  const CHUNK = 10
  const adDataMap: Record<string, any> = {}
  for (let i = 0; i < topInsights.length; i += CHUNK) {
    const chunk = topInsights.slice(i, i + CHUNK)
    const adParams = new URLSearchParams({
      ids: chunk.map((ins: any) => ins.ad_id).join(','),
      fields: `id,name,status,effective_status,creative{${CREATIVE_FIELDS}}`,
      access_token: token,
    })
    const adRes = await fetch(`${GRAPH}/?${adParams}`)
    const adChunk = await adRes.json() as any
    if (!adChunk.error) Object.assign(adDataMap, adChunk)
  }

  // Step 3 — bulk-resolve image_hash → full-res permalink via the adimages endpoint.
  // This gives the original-upload resolution for any image-based creative (typically
  // 1200×628 or higher), much sharper than thumbnail_url or link_data.picture.
  const hashUrlMap: Record<string, string> = {}
  const hashes = Object.values(adDataMap)
    .map((ad: any) => ad.creative?.image_hash)
    .filter(Boolean) as string[]

  if (hashes.length > 0) {
    try {
      const imgParams = new URLSearchParams({
        hashes: hashes.join(','),
        fields: 'hash,permalink_url',
        access_token: token,
      })
      const imgRes = await fetch(`${GRAPH}/${adAccountId}/adimages?${imgParams}`)
      const imgData = await imgRes.json() as any
      if (!imgData.error && Array.isArray(imgData.data)) {
        for (const img of imgData.data) {
          if (img.hash && img.permalink_url) hashUrlMap[img.hash] = img.permalink_url
        }
      }
    } catch { /* non-fatal — will fall back to lower-res sources */ }
  }

  return topInsights.map((ins: any) => {
    const ad = adDataMap[ins.ad_id] ?? {}
    const cr = ad.creative ?? {}
    const imageUrl   = pickBestImage(cr, hashUrlMap)
    const previewUrl = buildPreviewUrl(cr)
    return {
      id: ins.ad_id,
      name: ins.ad_name,
      status: ad.status ?? 'unknown',
      effective_status: ad.effective_status ?? 'unknown',
      creative: { ...cr, _imageUrl: imageUrl, _previewUrl: previewUrl },
      insights: { data: [ins] },
    }
  })
}

// Daily time-series insights — used by the Overview charts.
// Returns one row per day with spend, purchase value, ROAS, CTR, and
// conversion count so the frontend can draw Spend, ROAS, and CVR charts.
export async function getDailyInsights(adAccountId: string, token: string, dateRange = '30D') {
  const fields = [
    'date_start', 'spend', 'impressions', 'clicks', 'reach',
    'purchase_roas', 'ctr', 'actions', 'action_values',
  ].join(',')
  const params = new URLSearchParams({
    fields,
    time_range: JSON.stringify(toTimeRange(dateRange)),
    level: 'account',
    time_increment: '1',
    access_token: token,
  })
  return fetchAllPages(`${GRAPH}/${adAccountId}/insights?${params}`)
}

// ─── Verify a token is still valid ───────────────────────────────────────────

// expiresAt is Meta's current answer (Unix ms), null for a non-expiring token.
export async function verifyToken(token: string): Promise<{ valid: boolean; expiresAt: number | null }> {
  try {
    const appToken = `${APP_ID}|${APP_SECRET}`
    const res = await fetch(`${GRAPH}/debug_token?input_token=${token}&access_token=${appToken}`)
    const data = await res.json() as any
    const expiresSec = Number(data.data?.expires_at) || 0
    return { valid: data.data?.is_valid === true, expiresAt: expiresSec > 0 ? expiresSec * 1000 : null }
  } catch {
    return { valid: false, expiresAt: null }
  }
}
