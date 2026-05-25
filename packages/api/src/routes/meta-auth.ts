import { FastifyInstance } from 'fastify'
import {
  getOAuthUrl, exchangeCodeForToken, extendToLongLivedToken,
  getMetaUserId, getAdAccounts, tokenStore, verifyToken,
  getCampaignInsights, getCampaigns, getAdSets, getAds,
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
        return reply.redirect(`${FRONTEND}/settings?meta=error&reason=${error ?? 'no_code'}`)
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

        // Store in memory (replace with DB INSERT in production)
        tokenStore.set(clientId, {
          accessToken: longToken,
          adAccountIds: adAccounts.map((a: any) => a.id),
          metaUserId,
          expiresAt: Date.now() + expiresIn * 1000,
        })

        app.log.info({ clientId, metaUserId, accounts: adAccounts.length }, 'Meta token stored')

        // Pass token to frontend so it survives server restarts (stored in browser localStorage)
        const accountNames = adAccounts.map((a: any) => encodeURIComponent(a.name)).join(',')
        const accountData = encodeURIComponent(JSON.stringify(adAccounts.map((a: any) => ({ id: a.id, name: a.name, currency: a.currency }))))
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
        return reply.redirect(
          `${FRONTEND}/settings?meta=connected&accounts=${accountNames}&at=${encodeURIComponent(longToken)}&uid=${metaUserId}&acc=${accountData}&exp=${encodeURIComponent(expiresAt)}`
        )
      } catch (err: any) {
        app.log.error(err, 'Meta OAuth callback failed')
        return reply.redirect(`${FRONTEND}/settings?meta=error&reason=${encodeURIComponent(err.message)}`)
      }
    }
  )

  // Get connection status for a client
  app.get<{ Querystring: { clientId?: string } }>('/meta/status', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    const stored = tokenStore.get(clientId)
    if (!stored) return { connected: false }

    const valid = await verifyToken(stored.accessToken)
    if (!valid) {
      tokenStore.delete(clientId)
      return { connected: false, reason: 'token_expired' }
    }

    const adAccounts = await getAdAccounts(stored.accessToken)
    return {
      connected: true,
      metaUserId: stored.metaUserId,
      adAccounts: adAccounts.map((a: any) => ({ id: a.id, name: a.name, currency: a.currency })),
      expiresAt: new Date(stored.expiresAt).toISOString(),
    }
  })

  // Disconnect (revoke)
  app.delete<{ Querystring: { clientId?: string } }>('/meta/disconnect', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    tokenStore.delete(clientId)
    return { success: true }
  })
}

// ─── Meta data routes (stateless — token passed from client) ─────────────────

function resolveToken(clientId: string, headerToken?: string): string | null {
  // 1. Token passed directly from client (preferred — survives server restarts)
  if (headerToken) return headerToken
  // 2. Fall back to server-side store if available
  return tokenStore.get(clientId)?.accessToken ?? null
}

export async function metaDataRoutes(app: FastifyInstance) {

  app.get<{
    Querystring: { clientId?: string; adAccountId: string; datePreset?: string; level?: string }
  }>('/insights', async (request, reply) => {
    const { clientId = 'default', adAccountId, datePreset = 'last_30d', level = 'campaign' } = request.query
    const token = resolveToken(clientId, request.headers['x-meta-token'] as string)
    if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
    const insights = await getCampaignInsights(adAccountId, token, datePreset, level)
    return { data: insights, source: 'meta_api' }
  })

  app.get<{ Querystring: { clientId?: string; adAccountId: string } }>(
    '/campaigns',
    async (request, reply) => {
      const { clientId = 'default', adAccountId } = request.query
      const token = resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })

      const [campaigns, insights] = await Promise.all([
        getCampaigns(adAccountId, token),
        getCampaignInsights(adAccountId, token, 'last_30d', 'campaign'),
      ])
      const insightMap = new Map(insights.map((i: any) => [i.campaign_id, i]))
      return { data: campaigns.map((c: any) => ({ ...c, insights: insightMap.get(c.id) ?? null })), source: 'meta_api' }
    }
  )

  app.get<{ Querystring: { clientId?: string; adAccountId: string; campaignId?: string } }>(
    '/adsets',
    async (request, reply) => {
      const { clientId = 'default', adAccountId, campaignId } = request.query
      const token = resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })

      const [adsets, insights] = await Promise.all([
        getAdSets(adAccountId, token, campaignId),
        getCampaignInsights(adAccountId, token, 'last_30d', 'adset'),
      ])
      const insightMap = new Map(insights.map((i: any) => [i.adset_id, i]))
      return { data: adsets.map((a: any) => ({ ...a, insights: insightMap.get(a.id) ?? null })), source: 'meta_api' }
    }
  )

  app.get<{ Querystring: { clientId?: string; adAccountId: string } }>(
    '/ads',
    async (request, reply) => {
      const { clientId = 'default', adAccountId } = request.query
      const token = resolveToken(clientId, request.headers['x-meta-token'] as string)
      if (!token) return reply.code(401).send({ error: 'Meta not connected.' })
      return { data: await getAds(adAccountId, token), source: 'meta_api' }
    }
  )
}
