import { FastifyInstance } from 'fastify'
import {
  getOAuthUrl, exchangeCodeForToken, extendToLongLivedToken,
  getMetaUserId, getAdAccounts, tokenStore, verifyToken,
  getCampaignInsights, getCampaignInsightsForWindow, getCampaigns, getAccountInsights, getAccountInsightsForWindow, getCampaignDetail, getAdSetAdsDetail, getTopAds, getDailyInsights, getAdLevelInsights,
  dbSaveToken, dbGetToken, dbUpdateSelectedAccount, dbUpdateAdAccounts, dbGetAllSessions, dbDeleteToken, dbUpdateTokenExpiry,
} from '../services/meta'
import { previousWindow } from '../lib/dateWindows'
import { assertClientAccess, AuthUser } from '../lib/auth-guard'
import { clientExists } from '../lib/clients'
import { cachedMetaFetch, isRateLimitError } from '../lib/response-cache'

const CAMPAIGNS_CACHE_TTL_MS = 5 * 60 * 1000

export async function metaAuthRoutes(app: FastifyInstance) {

  // Returns the Meta consent-screen URL — frontend fetches this (with its
  // Authorization header) then does window.location.href = url itself. Can't
  // be a plain <a href> / server redirect any more: this route requires a
  // valid JWT, and a raw browser navigation has no way to attach that header.
  //
  // Admin-only: the Meta OAuth flow lists every ad account the connecting
  // Meta login can see, which for this agency's setup is every client's
  // ad account under one shared Business Manager identity. A client_user
  // reconnecting would see every other client's ad account name/currency —
  // confirmed as a real data-exposure concern, not hypothetical. Clients can
  // still view their own connection's status read-only via /settings.
  app.get<{ Querystring: { clientId?: string } }>('/meta', async (request, reply) => {
    if ((request.user as AuthUser).role !== 'admin') return reply.code(403).send({ error: 'Only an admin can connect Meta Ads.' })
    const clientId = request.query.clientId ?? 'default'
    assertClientAccess(request, clientId)
    return { url: getOAuthUrl(clientId) }
  })

  // Step 2: Meta redirects back here with ?code=xxx&state=clientId
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/meta/callback',
    async (request, reply) => {
      const { code, state, error } = request.query
      const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5174'

      if (error || !code) {
        return reply.redirect(`${FRONTEND}/settings?meta=error&clientId=${encodeURIComponent(state ?? 'default')}&reason=${error ?? 'no_code'}`)
      }

      if (!(await clientExists(state ?? ''))) {
        return reply.redirect(`${FRONTEND}/settings?meta=error&clientId=${encodeURIComponent(state ?? 'default')}&reason=unknown_client`)
      }

      try {
        // Exchange code → short-lived token
        const shortToken = await exchangeCodeForToken(code)

        // Extend to 60-day long-lived token
        const { token: longToken, expiresIn } = await extendToLongLivedToken(shortToken)

        // Get their Meta user ID and ad accounts
        const metaUserId = await getMetaUserId(longToken)
        const adAccounts = await getAdAccounts(longToken)

        const clientId = state ?? 'default'

        const tokenData = {
          accessToken:  longToken,
          adAccountIds: adAccounts.map((a: any) => a.id),
          adAccounts:   adAccounts.map((a: any) => ({
            id: a.id, name: a.name, currency: a.currency,
            business: a.business ? { id: a.business.id, name: a.business.name } : null,
          })),
          metaUserId,
          expiresAt:    Date.now() + expiresIn * 1000,
        }

        // Write to in-memory store (fast path for this server instance)
        tokenStore.set(clientId, tokenData)

        // Write to DB so any server instance / user can pick it up
        await dbSaveToken(clientId, { ...tokenData, adAccounts }).catch((err) =>
          app.log.error({ err: err.message }, 'Failed to persist Meta token to DB')
        )

        app.log.info({ clientId, metaUserId, accounts: adAccounts.length }, 'Meta token stored')

        // Pass token to frontend so it survives server restarts (stored in browser localStorage)
        const accountNames = adAccounts.map((a: any) => encodeURIComponent(a.name)).join(',')
        const accountData = encodeURIComponent(JSON.stringify(adAccounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
          business: a.business ? { id: a.business.id, name: a.business.name } : null,
        }))))
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
        return reply.redirect(
          `${FRONTEND}/settings?meta=connected&clientId=${encodeURIComponent(clientId)}&accounts=${accountNames}&at=${encodeURIComponent(longToken)}&uid=${metaUserId}&acc=${accountData}&exp=${encodeURIComponent(expiresAt)}`
        )
      } catch (err: any) {
        app.log.error(err, 'Meta OAuth callback failed')
        return reply.redirect(`${FRONTEND}/settings?meta=error&clientId=${encodeURIComponent(state ?? 'default')}&reason=${encodeURIComponent(err.message)}`)
      }
    }
  )

  // Get connection status for a client — checks memory then DB
  app.get<{ Querystring: { clientId?: string } }>('/meta/status', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    assertClientAccess(request, clientId)

    // 1. Try in-memory store
    let stored = tokenStore.get(clientId)

    // 2. Fall back to DB (covers restarts and cross-device logins)
    if (!stored) {
      try {
        const row = await dbGetToken(clientId)
        if (row) {
          stored = row
          tokenStore.set(clientId, row)  // warm cache
        }
      } catch { /* DB unavailable — stay with in-memory result */ }
    }

    if (!stored) return { connected: false }

    const { valid, expiresAt } = await verifyToken(stored.accessToken)
    if (!valid) {
      tokenStore.delete(clientId)
      return { connected: false, reason: 'token_expired' }
    }
    if (expiresAt && expiresAt !== stored.expiresAt) {
      stored = { ...stored, expiresAt }
      dbUpdateTokenExpiry(clientId, expiresAt).catch((err) =>
        app.log.error({ err: err.message, clientId }, 'Failed to sync Meta token expiry')
      )
    }

    let dbRow: Awaited<ReturnType<typeof dbGetToken>> = null
    try { dbRow = await dbGetToken(clientId) } catch { /* DB unavailable */ }

    // Always re-fetch live — this is a cheap call (id/name/currency/status
    // only, no insights or creative fields) — so a newly-granted ad account
    // in Meta Business Manager shows up on the next status check instead of
    // being stuck behind a cache that previously only ever refreshed at the
    // moment of the original OAuth connect. Only fall back to the last-known
    // DB list if the live call itself fails (token hiccup, Meta API down),
    // and never let a fallback silently mask a real problem from the caller.
    let adAccounts = dbRow?.adAccounts ?? []
    try {
      const liveAccounts = await getAdAccounts(stored.accessToken)
      adAccounts = liveAccounts
      dbUpdateAdAccounts(clientId, liveAccounts).catch((err) =>
        app.log.error({ err: err.message, clientId }, 'Failed to persist refreshed Meta ad accounts')
      )
    } catch (err: any) {
      app.log.error({ err: err.message, clientId }, 'Live getAdAccounts failed — falling back to cached list')
    }

    return {
      connected: true,
      metaUserId: stored.metaUserId,
      accessToken: stored.accessToken,
      adAccounts,
      selectedAdAccountId: dbRow?.selectedAdAccountId ?? null,
      expiresAt: new Date(stored.expiresAt).toISOString(),
    }
  })

  // Returns every connected client's Meta session, including access tokens —
  // admin-only. (Previously public with no clientId param at all, meaning
  // anyone could dump every client's tokens; Phase 3 replaces its purpose
  // with a properly-scoped GET /api/clients and this route can be removed.)
  app.get('/meta/sessions', async (request, reply) => {
    if ((request.user as AuthUser).role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    try {
      const sessions = await dbGetAllSessions()
      return { sessions }
    } catch {
      // DB unavailable — fall back to in-memory store so fresh OAuth on the
      // same server instance still surfaces the session.
      const sessions = [...tokenStore.entries()].map(([clientId, data]) => ({
        clientId,
        metaUserId: data.metaUserId,
        adAccounts: data.adAccounts ?? [],
        adAccountIds: data.adAccountIds,
        selectedAdAccountId: null,
        accessToken: data.accessToken,
        expiresAt: data.expiresAt,
      }))
      return { sessions }
    }
  })

  // Save which ad account the user selected — keeps new browsers in sync
  app.post<{ Body: { clientId: string; adAccountId: string } }>(
    '/meta/select-account',
    async (request, reply) => {
      const { clientId, adAccountId } = request.body
      if (!clientId || !adAccountId) return reply.code(400).send({ error: 'clientId and adAccountId required' })
      assertClientAccess(request, clientId)
      try { await dbUpdateSelectedAccount(clientId, adAccountId) } catch { /* DB unavailable — no-op */ }
      return { ok: true }
    }
  )

  // Disconnect (revoke) — clears in-memory cache AND the persisted DB row.
  // Without the DB delete, a "disconnected" or deleted client resurfaces on
  // the next session-discovery pass since its row would still be there.
  // Admin-only for the same reason /meta connect is: a client disconnecting
  // and reconnecting is how they'd end up seeing every other client's ad
  // account under the shared Business Manager identity.
  app.delete<{ Querystring: { clientId?: string } }>('/meta/disconnect', async (request, reply) => {
    if ((request.user as AuthUser).role !== 'admin') return reply.code(403).send({ error: 'Only an admin can disconnect Meta Ads.' })
    const clientId = request.query.clientId ?? 'default'
    assertClientAccess(request, clientId)
    tokenStore.delete(clientId)
    await dbDeleteToken(clientId).catch((err) =>
      app.log.error({ err: err.message, clientId }, 'Failed to delete Meta token from DB')
    )
    return { success: true }
  })
}

// ─── Meta data routes (stateless — token passed from client) ─────────────────

// Meta's development-tier throttle surfaces as "User request limit reached" —
// translate it into something a marketer can act on, with the right status.
function metaFailure(err: any, fallback: string): { status: number; error: string } {
  const msg: string = err?.message ?? ''
  if (isRateLimitError(err)) {
    return { status: 429, error: 'Meta is rate-limiting this ad account right now — try again in a minute.' }
  }
  return { status: 500, error: msg || fallback }
}

async function resolveToken(clientId: string, headerToken?: string): Promise<string | null> {
  // 1. Header token from client localStorage — fastest, no DB round-trip
  if (headerToken) return headerToken
  // 2. In-memory store — same server instance, still fast
  const mem = tokenStore.get(clientId)
  if (mem) return mem.accessToken
  // 3. DB — covers other browsers/users who never did the OAuth themselves
  try {
    const row = await dbGetToken(clientId)
    if (row) {
      tokenStore.set(clientId, { ...row, adAccounts: row.adAccounts ?? [] })
      return row.accessToken
    }
  } catch { /* DB unavailable */ }
  return null
}

export async function metaDataRoutes(app: FastifyInstance) {

  app.get<{
    Querystring: { clientId?: string; adAccountId: string; dateRange?: string; level?: string }
  }>('/insights', async (request, reply) => {
    const { clientId = 'default', adAccountId, dateRange = '30D', level = 'campaign' } = request.query
    assertClientAccess(request, clientId)
    const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
    if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
    const insights = await getCampaignInsights(adAccountId, token, dateRange, level)
    return { data: insights, source: 'meta_api' }
  })

  app.get<{ Querystring: { clientId?: string; adAccountId: string; dateRange?: string } }>(
    '/campaigns',
    async (request, reply) => {
      const { clientId = 'default', adAccountId, dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })

      // Large accounts take several seconds and a dozen+ Meta calls to load —
      // cached, de-duplicated, and served from the last good copy if Meta
      // rate-limits (see cachedMetaFetch).
      const cacheKey = `meta:campaigns:v2:${clientId}:${adAccountId}:${dateRange}`
      try {
        return await cachedMetaFetch(cacheKey, CAMPAIGNS_CACHE_TTL_MS, async () => {
          const soft = (label: string, p: Promise<any>) =>
            p.catch((err: any) => { app.log.error({ err: err.message, label }, 'Meta API call failed'); return null })
          // Current-period calls are required: a failure must not be cached as
          // a table of zero spend. Previous-period (trend) calls are optional.
          const [campaigns, campaignInsights, previousCampaignInsights, accountInsights, previousAccountInsights] = await Promise.all([
            getCampaigns(adAccountId, token),
            getCampaignInsights(adAccountId, token, dateRange, 'campaign'),
            soft('previousCampaignInsights', getCampaignInsightsForWindow(adAccountId, token, previousWindow(dateRange), 'campaign')),
            getAccountInsights(adAccountId, token, dateRange),
            soft('previousAccountInsights', getAccountInsightsForWindow(adAccountId, token, previousWindow(dateRange))),
          ])
          const insightMap = new Map((campaignInsights ?? []).map((i: any) => [i.campaign_id, i]))
          const previousInsightMap = new Map((previousCampaignInsights ?? []).map((i: any) => [i.campaign_id, i]))
          // Structure refused by Meta: list the campaigns that delivered, named
          // from their insights rows (status/budget unknown).
          const partial = campaigns === null
          const campaignRows = campaigns ?? (campaignInsights ?? []).map((i: any) => ({ id: i.campaign_id, name: i.campaign_name }))
          return {
            partial,
            data: campaignRows.map((c: any) => ({
              ...c,
              insights: insightMap.get(c.id) ?? null,
              previousInsights: previousInsightMap.get(c.id) ?? null,
              adsets: [],
            })),
            accountInsights: accountInsights ?? null,
            previousAccountInsights: previousAccountInsights ?? null,
            source: 'meta_api',
          }
        })
      } catch (err: any) {
        app.log.error({ err: err.message, adAccountId }, 'campaigns failed')
        const f = metaFailure(err, 'Failed to load campaigns')
        return reply.code(f.status).send({ error: f.error })
      }
    }
  )

  // Lazy-loaded per-campaign detail: ad sets + ads + their insights.
  // Called when the user expands a campaign row in the UI.
  app.get<{ Querystring: { clientId?: string; campaignId: string; dateRange?: string } }>(
    '/campaign-detail',
    async (request, reply) => {
      const { clientId = 'default', campaignId, dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
      try {
        return await cachedMetaFetch(`meta:campaign-detail:v2:${clientId}:${campaignId}:${dateRange}`, CAMPAIGNS_CACHE_TTL_MS,
          async () => ({ ...(await getCampaignDetail(campaignId, token, dateRange)), source: 'meta_api' }))
      } catch (err: any) {
        app.log.error({ err: err.message, campaignId }, 'getCampaignDetail failed')
        const f = metaFailure(err, 'Failed to load campaign detail')
        return reply.code(f.status).send({ error: f.error })
      }
    }
  )

  // Lazy-loaded per-ad-set ads: called when the user expands a specific ad
  // set row (not the whole campaign) — see getAdSetAdsDetail for why ads
  // can't be fetched eagerly for the whole campaign on large accounts.
  app.get<{ Querystring: { clientId?: string; adSetId: string; dateRange?: string } }>(
    '/adset-ads',
    async (request, reply) => {
      const { clientId = 'default', adSetId, dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
      try {
        return await cachedMetaFetch(`meta:adset-ads:v2:${clientId}:${adSetId}:${dateRange}`, CAMPAIGNS_CACHE_TTL_MS,
          async () => ({ ...(await getAdSetAdsDetail(adSetId, token, dateRange)), source: 'meta_api' }))
      } catch (err: any) {
        app.log.error({ err: err.message, adSetId }, 'getAdSetAdsDetail failed')
        const f = metaFailure(err, 'Failed to load ad set ads')
        return reply.code(f.status).send({ error: f.error })
      }
    }
  )

  // Every ad with spend in the window — feeds the Scale/Optimise/Watch Excel export.
  app.get<{ Querystring: { clientId?: string; adAccountId: string; dateRange?: string } }>(
    '/ads-export',
    async (request, reply) => {
      const { clientId = 'default', adAccountId, dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
      try {
        const rows = await getAdLevelInsights(adAccountId, token, dateRange)
        return { data: rows, source: 'meta_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, adAccountId }, 'getAdLevelInsights failed')
        const f = metaFailure(err, 'Failed to export ads')
        return reply.code(f.status).send({ error: f.error })
      }
    }
  )

  // Top ads with creative assets — used by the Creatives page.
  // 2-step: insights endpoint for metrics, batch-fetch for creative details.
  app.get<{ Querystring: { clientId?: string; adAccountId: string; limit?: string } }>(
    '/top-ads',
    async (request, reply) => {
      const { clientId = 'default', adAccountId, limit = '25' } = request.query
      assertClientAccess(request, clientId)
      const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
      // Heaviest Meta call in the app (insights + creative batches + images),
      // and its window is fixed at 30 days — safe to cache for 15 minutes.
      try {
        return await cachedMetaFetch(`meta:top-ads:v2:${clientId}:${adAccountId}:${limit}`, 15 * 60 * 1000,
          async () => ({ data: await getTopAds(adAccountId, token, Number(limit)), source: 'meta_api' }))
      } catch (err: any) {
        app.log.error({ err: err.message, adAccountId }, 'getTopAds failed')
        const f = metaFailure(err, 'Failed to fetch creatives')
        return reply.code(f.status).send({ error: f.error })
      }
    }
  )

  // Daily time-series insights — used by the Overview charts.
  app.get<{ Querystring: { clientId?: string; adAccountId: string; dateRange?: string } }>(
    '/daily-insights',
    async (request, reply) => {
      const { clientId = 'default', adAccountId, dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
      try {
        return await cachedMetaFetch(`meta:daily:v2:${clientId}:${adAccountId}:${dateRange}`, CAMPAIGNS_CACHE_TTL_MS,
          async () => ({ data: await getDailyInsights(adAccountId, token, dateRange), source: 'meta_api' }))
      } catch (err: any) {
        app.log.error({ err: err.message, adAccountId }, 'getDailyInsights failed')
        const f = metaFailure(err, 'Failed to fetch daily insights')
        return reply.code(f.status).send({ error: f.error })
      }
    }
  )

}
