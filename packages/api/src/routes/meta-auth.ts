import { FastifyInstance } from 'fastify'
import {
  getOAuthUrl, exchangeCodeForToken, extendToLongLivedToken,
  getMetaUserId, getAdAccounts, tokenStore, verifyToken,
  getCampaignInsights, getCampaignInsightsForWindow, getCampaigns, getAccountInsights, getCampaignDetail, getTopAds, getDailyInsights,
  dbSaveToken, dbGetToken, dbUpdateSelectedAccount, dbGetAllSessions, dbDeleteToken,
} from '../services/meta'
import { previousWindow } from '../lib/dateWindows'
import { assertClientAccess, AuthUser } from '../lib/auth-guard'
import { clientExists } from '../lib/clients'

export async function metaAuthRoutes(app: FastifyInstance) {

  // Returns the Meta consent-screen URL — frontend fetches this (with its
  // Authorization header) then does window.location.href = url itself. Can't
  // be a plain <a href> / server redirect any more: this route requires a
  // valid JWT (admin always allowed; a client_user only for a reconnect of
  // their own already-established client), and a raw browser navigation has
  // no way to attach that header.
  app.get<{ Querystring: { clientId?: string } }>('/meta', async (request) => {
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

    const valid = await verifyToken(stored.accessToken)
    if (!valid) {
      tokenStore.delete(clientId)
      return { connected: false, reason: 'token_expired' }
    }

    // Use cached ad accounts from DB; fall back to a live Meta call if DB is down
    let dbRow: Awaited<ReturnType<typeof dbGetToken>> = null
    try { dbRow = await dbGetToken(clientId) } catch { /* DB unavailable */ }

    const adAccounts = dbRow?.adAccounts?.length
      ? dbRow.adAccounts
      : await getAdAccounts(stored.accessToken)

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
  app.delete<{ Querystring: { clientId?: string } }>('/meta/disconnect', async (request) => {
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

      const safe = async (label: string, fn: () => Promise<any>): Promise<any> => {
        try { return await fn() }
        catch (err: any) {
          app.log.error({ err: err.message, label }, 'Meta API call failed')
          return null
        }
      }

      // Fetch campaigns + campaign-level insights (paginated) and account-level
      // totals in parallel. Ad sets/ads are loaded lazily per campaign on expand.
      // Previous-period insights are fetched alongside so the frontend can derive
      // a per-metric trend badge without a second round trip.
      const [campaigns, campaignInsights, previousCampaignInsights, accountInsights] = await Promise.all([
        getCampaigns(adAccountId, token),
        safe('campaignInsights', () => getCampaignInsights(adAccountId, token, dateRange, 'campaign')),
        safe('previousCampaignInsights', () => getCampaignInsightsForWindow(adAccountId, token, previousWindow(dateRange), 'campaign')),
        safe('accountInsights',  () => getAccountInsights(adAccountId, token, dateRange)),
      ])

      const insightMap = new Map((campaignInsights ?? []).map((i: any) => [i.campaign_id, i]))
      const previousInsightMap = new Map((previousCampaignInsights ?? []).map((i: any) => [i.campaign_id, i]))

      return {
        data: campaigns.map((c: any) => ({
          ...c,
          insights: insightMap.get(c.id) ?? null,
          previousInsights: previousInsightMap.get(c.id) ?? null,
          adsets: [],
        })),
        accountInsights: accountInsights ?? null,
        source: 'meta_api',
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
        const adSets = await getCampaignDetail(campaignId, token, dateRange)
        return { adSets, source: 'meta_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, campaignId }, 'getCampaignDetail failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to load campaign detail' })
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
      try {
        const ads = await getTopAds(adAccountId, token, Number(limit))
        return { data: ads, source: 'meta_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, adAccountId }, 'getTopAds failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to fetch creatives' })
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
        const rows = await getDailyInsights(adAccountId, token, dateRange)
        return { data: rows, source: 'meta_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, adAccountId }, 'getDailyInsights failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to fetch daily insights' })
      }
    }
  )

}
