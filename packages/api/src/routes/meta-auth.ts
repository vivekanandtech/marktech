import { FastifyInstance } from 'fastify'
import {
  getOAuthUrl, exchangeCodeForToken, extendToLongLivedToken,
  getMetaUserId, getAdAccounts, tokenStore, verifyToken,
  getCampaignInsights, getCampaigns, getAccountInsights, getCampaignDetail, getTopAds,
  dbSaveToken, dbGetToken, dbUpdateSelectedAccount, dbGetAllSessions,
} from '../services/meta'

export async function metaAuthRoutes(app: FastifyInstance) {

  // Step 1: Redirect client to Meta OAuth consent screen
  // Frontend calls: GET /auth/meta?clientId=xxx
  app.get<{ Querystring: { clientId?: string } }>('/meta', async (request, reply) => {
    const clientId = request.query.clientId ?? 'default'
    const url = getOAuthUrl(clientId)
    return reply.redirect(url)
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

    // 1. Try in-memory store
    let stored = tokenStore.get(clientId)

    // 2. Fall back to DB (covers restarts and cross-device logins)
    if (!stored) {
      const row = await dbGetToken(clientId)
      if (row) {
        stored = row
        tokenStore.set(clientId, row)  // warm cache
      }
    }

    if (!stored) return { connected: false }

    const valid = await verifyToken(stored.accessToken)
    if (!valid) {
      tokenStore.delete(clientId)
      return { connected: false, reason: 'token_expired' }
    }

    // Use cached ad accounts from DB to avoid an extra Meta API call
    const dbRow = await dbGetToken(clientId)
    const adAccounts = dbRow?.adAccounts?.length
      ? dbRow.adAccounts
      : await getAdAccounts(stored.accessToken)

    return {
      connected: true,
      metaUserId: stored.metaUserId,
      adAccounts,
      selectedAdAccountId: dbRow?.selectedAdAccountId ?? null,
      expiresAt: new Date(stored.expiresAt).toISOString(),
    }
  })

  // Return all active Meta sessions — used by new browsers to auto-populate
  // the client store without requiring re-authentication.
  app.get('/meta/sessions', async () => {
    const sessions = await dbGetAllSessions()
    return { sessions }
  })

  // Save which ad account the user selected — keeps new browsers in sync
  app.post<{ Body: { clientId: string; adAccountId: string } }>(
    '/meta/select-account',
    async (request, reply) => {
      const { clientId, adAccountId } = request.body
      if (!clientId || !adAccountId) return reply.code(400).send({ error: 'clientId and adAccountId required' })
      await dbUpdateSelectedAccount(clientId, adAccountId)
      return { ok: true }
    }
  )

  // Disconnect (revoke)
  app.delete<{ Querystring: { clientId?: string } }>('/meta/disconnect', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    tokenStore.delete(clientId)
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
  const row = await dbGetToken(clientId)
  if (row) {
    // Warm the in-memory cache so next request is fast
    tokenStore.set(clientId, row)
    return row.accessToken
  }
  return null
}

export async function metaDataRoutes(app: FastifyInstance) {

  app.get<{
    Querystring: { clientId?: string; adAccountId: string; dateRange?: string; level?: string }
  }>('/insights', async (request, reply) => {
    const { clientId = 'default', adAccountId, dateRange = '30D', level = 'campaign' } = request.query
    const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
    if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
    const insights = await getCampaignInsights(adAccountId, token, dateRange, level)
    return { data: insights, source: 'meta_api' }
  })

  app.get<{ Querystring: { clientId?: string; adAccountId: string; dateRange?: string } }>(
    '/campaigns',
    async (request, reply) => {
      const { clientId = 'default', adAccountId, dateRange = '30D' } = request.query
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
      const [campaigns, campaignInsights, accountInsights] = await Promise.all([
        getCampaigns(adAccountId, token),
        safe('campaignInsights', () => getCampaignInsights(adAccountId, token, dateRange, 'campaign')),
        safe('accountInsights',  () => getAccountInsights(adAccountId, token, dateRange)),
      ])

      const insightMap = new Map((campaignInsights ?? []).map((i: any) => [i.campaign_id, i]))

      return {
        data: campaigns.map((c: any) => ({
          ...c,
          insights: insightMap.get(c.id) ?? null,
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
      const token = await resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
      const adSets = await getCampaignDetail(campaignId, token, dateRange)
      return { adSets, source: 'meta_api' }
    }
  )

  // Top ads with creative assets — used by the Creatives page.
  // Uses a fixed 30-day window via Meta's date_preset so creative ROAS/spend
  // reflects real recent performance.
  app.get<{ Querystring: { clientId?: string; adAccountId: string; limit?: string } }>(
    '/top-ads',
    async (request, reply) => {
      const { clientId = 'default', adAccountId, limit = '50' } = request.query
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

}
