import { FastifyInstance } from 'fastify'
import {
  getGoogleOAuthUrl, exchangeGoogleCode, getValidAccessToken,
  listAccessibleCustomers, getGoogleCampaigns, getGoogleCampaignsForWindow, getGoogleAdGroups,
  getGoogleAdGroupsForWindow, getGoogleAds, getGoogleAdsForWindow,
  getGoogleAccountInsights, getGoogleDailyInsights,
  googleTokenStore, GoogleCustomer,
  dbSaveGoogleToken, dbGetGoogleToken, dbDeleteGoogleToken,
  dbGetAllGoogleSessions, dbUpdateGoogleCustomer,
} from '../services/google'
import { previousWindow } from '../lib/dateWindows'
import { assertClientAccess, AuthUser } from '../lib/auth-guard'
import { clientExists } from '../lib/clients'
import { getCachedResponse, setCachedResponse } from '../lib/response-cache'

const CAMPAIGNS_CACHE_TTL_MS = 5 * 60 * 1000

// ─── Auth routes (public — registered under /auth) ───────────────────────────

export async function googleAuthRoutes(app: FastifyInstance) {

  // Returns the Google consent-screen URL — see the matching comment on
  // GET /meta for why this can't be a server-side redirect any more.
  app.get<{ Querystring: { clientId?: string } }>('/google', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    assertClientAccess(request, clientId)
    return { url: getGoogleOAuthUrl(clientId) }
  })

  // Step 2: Google redirects back here with ?code=xxx&state=clientId
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/google/callback',
    async (request, reply) => {
      const { code, state, error } = request.query
      const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5173'

      if (error || !code) {
        return reply.redirect(
          `${FRONTEND}/settings?google=error&clientId=${encodeURIComponent(state ?? 'default')}&reason=${encodeURIComponent(error ?? 'no_code')}`
        )
      }

      const clientId = state ?? 'default'
      if (!(await clientExists(clientId))) {
        return reply.redirect(
          `${FRONTEND}/settings?google=error&clientId=${encodeURIComponent(clientId)}&reason=unknown_client`
        )
      }
      try {
        const { accessToken, refreshToken, expiresIn } = await exchangeGoogleCode(code)
        const accessTokenExpiry = Date.now() + expiresIn * 1000

        // Save tokens — skip listAccessibleCustomers (requires approved dev token).
        // The user will enter their Customer ID manually in Settings.
        const tokenData = {
          refreshToken,
          accessToken,
          accessTokenExpiry,
          customerId: null,
          customerName: null,
          customers: [],
        }

        googleTokenStore.set(clientId, tokenData)
        await dbSaveGoogleToken(clientId, tokenData).catch((err) =>
          app.log.error({ err: err.message }, 'Failed to persist Google token')
        )

        app.log.info({ clientId }, 'Google token stored — awaiting customer ID selection')

        return reply.redirect(
          `${FRONTEND}/settings?google=connected&clientId=${encodeURIComponent(clientId)}`
        )
      } catch (err: any) {
        app.log.error(err, 'Google OAuth callback failed')
        return reply.redirect(
          `${FRONTEND}/settings?google=error&clientId=${encodeURIComponent(clientId)}&reason=${encodeURIComponent(err.message)}`
        )
      }
    }
  )

  // Diagnostic — tests dev token + customer list without full OAuth. Admin-only.
  app.get<{ Querystring: { token?: string } }>('/google/diag', async (request, reply) => {
    if ((request.user as AuthUser).role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const accessToken = request.query.token ?? ''
    if (!accessToken) return { error: 'pass ?token=<access_token>' }
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    }
    const res = await fetch('https://googleads.googleapis.com/v25/customers:listAccessibleCustomers', { headers })
    const text = await res.text()
    return { status: res.status, devTokenLength: devToken.length, body: text.slice(0, 500) }
  })

  // Get connection status
  app.get<{ Querystring: { clientId?: string } }>('/google/status', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    assertClientAccess(request, clientId)
    // Check in-memory first, then fall back to DB
    const mem = googleTokenStore.get(clientId)
    let row: Awaited<ReturnType<typeof dbGetGoogleToken>> = null
    try { row = await dbGetGoogleToken(clientId) } catch { /* DB unavailable */ }
    const data = row ?? (mem ? { customerId: mem.customerId, customerName: mem.customerName, customers: mem.customers } : null)
    if (!data) return { connected: false }
    return {
      connected: true,
      customerId: data.customerId,
      customerName: data.customerName,
      customers: data.customers,
    }
  })

  // Returns every connected client's Google session — admin-only. (Phase 3
  // replaces its purpose with a properly-scoped GET /api/clients.)
  app.get('/google/sessions', async (request, reply) => {
    if ((request.user as AuthUser).role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    try {
      const sessions = await dbGetAllGoogleSessions()
      return { sessions }
    } catch {
      // DB unavailable — fall back to in-memory store
      const sessions = [...googleTokenStore.entries()].map(([clientId, data]) => ({
        clientId,
        customerId: data.customerId ?? null,
        customerName: data.customerName ?? null,
        customers: data.customers ?? [],
      }))
      return { sessions }
    }
  })

  // Save which Google customer the user selected
  app.post<{ Body: { clientId: string; customerId: string; customerName: string } }>(
    '/google/select-customer',
    async (request, reply) => {
      const { clientId, customerId, customerName } = request.body
      if (!clientId || !customerId) return reply.code(400).send({ error: 'clientId and customerId required' })
      assertClientAccess(request, clientId)

      // Update in-memory cache
      const cached = googleTokenStore.get(clientId)
      if (cached) googleTokenStore.set(clientId, { ...cached, customerId, customerName })

      await dbUpdateGoogleCustomer(clientId, customerId, customerName)
      return { ok: true }
    }
  )

  // Disconnect — clears memory + DB
  app.delete<{ Querystring: { clientId?: string } }>('/google/disconnect', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    assertClientAccess(request, clientId)
    googleTokenStore.delete(clientId)
    await dbDeleteGoogleToken(clientId).catch((err) =>
      app.log.error({ err: err.message }, 'Failed to delete Google token from DB')
    )
    return { success: true }
  })
}

// ─── Data routes (JWT-protected, registered under /api/google) ───────────────

async function resolveGoogleToken(clientId: string): Promise<{
  accessToken: string
  customerId: string
  managerId: string | undefined
} | null> {
  const cached = googleTokenStore.get(clientId)
  const customerId = cached?.customerId ?? (await dbGetGoogleToken(clientId))?.customerId ?? null
  if (!customerId) return null

  const accessToken = await getValidAccessToken(clientId)
  if (!accessToken) return null

  // Don't force login-customer-id — only use it if the account is actually
  // a sub-account of the MCC. Callers can pass it explicitly when needed.
  return { accessToken, customerId, managerId: undefined }
}

export async function googleDataRoutes(app: FastifyInstance) {

  // Account-level + campaign-level data
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/campaigns',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      const auth = await resolveGoogleToken(clientId)
      if (!auth) return reply.code(401).send({ error: 'Google Ads not connected.' })

      // Same reasoning as Meta's campaigns cache: the Google Ads API is slow
      // for accounts with many campaigns, and this is re-fetched live on
      // every page visit today.
      const cacheKey = `google:campaigns:${clientId}:${auth.customerId}:${dateRange}`
      const cached = await getCachedResponse<any>(cacheKey, CAMPAIGNS_CACHE_TTL_MS)
      if (cached) return cached

      // Swallowing every failure into an empty array made a genuinely broken
      // customer ID or a developer-token permission issue look identical to
      // "this account just has zero campaigns" — undiagnosable from the UI,
      // with the real reason only ever reaching a server log. Surface the
      // primary call's actual error message instead (previousCampaigns is
      // supplementary — a trend-comparison miss there shouldn't block the
      // page, so it stays silent-fallback).
      const safe = async (label: string, fn: () => Promise<any>): Promise<{ value: any; error: string | null }> => {
        try { return { value: await fn(), error: null } }
        catch (err: any) {
          app.log.error({ err: err.message, label }, 'Google Ads API call failed')
          return { value: null, error: err.message }
        }
      }

      const [campaigns, previousCampaigns, accountInsights] = await Promise.all([
        safe('campaigns', () => getGoogleCampaigns(auth.customerId, auth.accessToken, dateRange, auth.managerId)),
        safe('previousCampaigns', () => getGoogleCampaignsForWindow(auth.customerId, auth.accessToken, previousWindow(dateRange), auth.managerId)),
        safe('accountInsights', () => getGoogleAccountInsights(auth.customerId, auth.accessToken, dateRange, auth.managerId)),
      ])

      const previousByCampaignId = new Map<string, any>((previousCampaigns.value ?? []).map((c: any) => [c.campaign?.id, c]))

      const response = {
        data: (campaigns.value ?? []).map((c: any) => ({
          ...c,
          previousMetrics: previousByCampaignId.get(c.campaign?.id)?.metrics ?? null,
        })),
        accountInsights: accountInsights.value ?? null,
        customerId: auth.customerId,
        source: 'google_ads_api',
        ...(campaigns.error ? { error: campaigns.error } : {}),
      }
      // Don't cache a failure — the whole point of surfacing the real error is
      // so a fix (e.g. correcting the developer token) is visible immediately
      // on the next load, not stuck behind a stale cached error.
      if (!campaigns.error) await setCachedResponse(cacheKey, response)
      return response
    }
  )

  // Ad groups for a specific campaign (lazy-loaded on expand)
  app.get<{ Querystring: { clientId?: string; campaignId: string; dateRange?: string } }>(
    '/ad-groups',
    async (request, reply) => {
      const { clientId = 'default', campaignId, dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      const auth = await resolveGoogleToken(clientId)
      if (!auth) return reply.code(401).send({ error: 'Google Ads not connected.' })

      const window = previousWindow(dateRange)

      try {
        const [adGroups, previousAdGroups, adsRaw, previousAdsRaw] = await Promise.all([
          getGoogleAdGroups(auth.customerId, campaignId, auth.accessToken, dateRange, auth.managerId),
          getGoogleAdGroupsForWindow(auth.customerId, campaignId, auth.accessToken, window, auth.managerId).catch(() => []),
          // Fetch all ads for this campaign keyed by ad_group.id
          (async () => {
            try {
              const allAds: any[] = []
              const adGroupRows = await getGoogleAdGroups(auth.customerId, campaignId, auth.accessToken, dateRange, auth.managerId)
              await Promise.all(
                adGroupRows.map(async (ag: any) => {
                  const agId = ag.adGroup?.id
                  if (!agId) return
                  const ads = await getGoogleAds(auth.customerId, agId, auth.accessToken, dateRange, auth.managerId)
                  allAds.push(...ads.map((a: any) => ({ ...a, _adGroupId: agId })))
                })
              )
              return allAds
            } catch { return [] }
          })(),
          // Same, for the previous window — used to compute trend badges.
          (async () => {
            try {
              const allAds: any[] = []
              const adGroupRows = await getGoogleAdGroupsForWindow(auth.customerId, campaignId, auth.accessToken, window, auth.managerId)
              await Promise.all(
                adGroupRows.map(async (ag: any) => {
                  const agId = ag.adGroup?.id
                  if (!agId) return
                  const ads = await getGoogleAdsForWindow(auth.customerId, agId, auth.accessToken, window, auth.managerId)
                  allAds.push(...ads.map((a: any) => ({ ...a, _adGroupId: agId })))
                })
              )
              return allAds
            } catch { return [] }
          })(),
        ])

        const adsByGroup = new Map<string, any[]>()
        for (const ad of adsRaw) {
          const agId = ad._adGroupId ?? ad.adGroup?.id
          if (!agId) continue
          const list = adsByGroup.get(agId) ?? []
          list.push(ad)
          adsByGroup.set(agId, list)
        }

        const previousAdGroupMetrics = new Map(previousAdGroups.map((ag: any) => [ag.adGroup?.id, ag.metrics]))
        const previousAdMetrics = new Map(
          previousAdsRaw.map((a: any) => [a.adGroupAd?.ad?.id, a.metrics])
        )

        return {
          adGroups: adGroups.map((ag: any) => ({
            ...ag,
            previousMetrics: previousAdGroupMetrics.get(ag.adGroup?.id) ?? null,
            ads: (adsByGroup.get(ag.adGroup?.id) ?? []).map((ad: any) => ({
              ...ad,
              previousMetrics: previousAdMetrics.get(ad.adGroupAd?.ad?.id) ?? null,
            })),
          })),
          source: 'google_ads_api',
        }
      } catch (err: any) {
        app.log.error({ err: err.message, campaignId }, 'getGoogleAdGroups failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )

  // Daily time-series insights — for Overview charts
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/daily-insights',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      const auth = await resolveGoogleToken(clientId)
      if (!auth) return reply.code(401).send({ error: 'Google Ads not connected.' })

      try {
        const rows = await getGoogleDailyInsights(auth.customerId, auth.accessToken, dateRange, auth.managerId)
        return { data: rows, source: 'google_ads_api' }
      } catch (err: any) {
        app.log.error({ err: err.message }, 'getGoogleDailyInsights failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )
}
