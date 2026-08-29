import { FastifyInstance } from 'fastify'
import {
  getShopifyOAuthUrl, exchangeShopifyCode, getShopInfo, runShopifyQL,
  normalizeShopDomain, shopifyTokenStore, getClientCredentialsToken,
  dbSaveShopifyToken, dbGetShopifyToken, dbDeleteShopifyToken,
  getOrdersByChannel, getMetaSessions, getSalesByCountry, getAvailableCountries,
  getNewCustomerCount,
} from '../services/shopify'

// ─── Auth routes ──────────────────────────────────────────────────────────────

export async function shopifyAuthRoutes(app: FastifyInstance) {

  // Step 1: Redirect to Shopify OAuth consent screen
  // Frontend calls: GET /auth/shopify?clientId=xxx&shop=dohar-india
  app.get<{ Querystring: { clientId?: string; shop?: string } }>(
    '/shopify',
    async (request, reply) => {
      const { clientId = 'default', shop } = request.query
      if (!shop) return reply.code(400).send({ error: 'shop query param required (e.g. dohar-india)' })
      const url = getShopifyOAuthUrl(shop, clientId)
      return reply.redirect(url)
    }
  )

  // Step 2: Shopify redirects here after user approves
  app.get<{ Querystring: { code?: string; state?: string; shop?: string; hmac?: string; error?: string } }>(
    '/shopify/callback',
    async (request, reply) => {
      const { code, state, shop, error } = request.query
      const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5173'

      if (error || !code || !shop) {
        return reply.redirect(
          `${FRONTEND}/settings?shopify=error&clientId=${encodeURIComponent(state ?? 'default')}&reason=${encodeURIComponent(error ?? 'no_code')}`
        )
      }

      const clientId = state ?? 'default'
      try {
        const { accessToken, scope } = await exchangeShopifyCode(shop, code)
        const shopInfo = await getShopInfo(shop, accessToken)

        const tokenData = { shopDomain: shop, accessToken, shopName: shopInfo.name, scope }
        shopifyTokenStore.set(clientId, tokenData)
        await dbSaveShopifyToken(clientId, tokenData).catch((err) =>
          app.log.error({ err: err.message }, 'Failed to persist Shopify token')
        )

        app.log.info({ clientId, shop, shopName: shopInfo.name }, 'Shopify token stored')

        const shopInfoParam = encodeURIComponent(JSON.stringify({ domain: shop, name: shopInfo.name }))
        return reply.redirect(
          `${FRONTEND}/settings?shopify=connected&clientId=${encodeURIComponent(clientId)}&shopInfo=${shopInfoParam}`
        )
      } catch (err: any) {
        app.log.error(err, 'Shopify OAuth callback failed')
        return reply.redirect(
          `${FRONTEND}/settings?shopify=error&clientId=${encodeURIComponent(clientId)}&reason=${encodeURIComponent(err.message)}`
        )
      }
    }
  )

  // Get connection status
  app.get<{ Querystring: { clientId?: string } }>('/shopify/status', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    let stored = shopifyTokenStore.get(clientId)
    if (!stored) {
      const row = await dbGetShopifyToken(clientId)
      if (row) { stored = row; shopifyTokenStore.set(clientId, row) }
    }
    if (!stored) return { connected: false }
    return { connected: true, shopDomain: stored.shopDomain, shopName: stored.shopName }
  })

  // Direct token connect — for Custom Apps (no OAuth needed)
  // Frontend POSTs { clientId, shopDomain, accessToken } after user pastes the shpat_ token
  app.post<{ Body: { clientId?: string; shopDomain: string; accessToken: string } }>(
    '/shopify/connect',
    async (request, reply) => {
      const { clientId = 'default', shopDomain, accessToken } = request.body
      if (!shopDomain || !accessToken) {
        return reply.code(400).send({ error: 'shopDomain and accessToken are required' })
      }

      const normalized = shopDomain.toLowerCase().trim().includes('.myshopify.com')
        ? shopDomain.toLowerCase().trim()
        : `${shopDomain.toLowerCase().trim()}.myshopify.com`

      try {
        // Verify the token actually works before storing it
        const shopInfo = await getShopInfo(normalized, accessToken)
        const tokenData = { shopDomain: normalized, accessToken, shopName: shopInfo.name, scope: 'custom_app' }
        shopifyTokenStore.set(clientId, tokenData)
        await dbSaveShopifyToken(clientId, tokenData).catch((err) =>
          app.log.error({ err: err.message }, 'Failed to persist Shopify token')
        )
        app.log.info({ clientId, shopDomain: normalized, shopName: shopInfo.name }, 'Shopify custom app token stored')
        return { connected: true, shopDomain: normalized, shopName: shopInfo.name }
      } catch (err: any) {
        app.log.error({ err: err.message, shopDomain: normalized }, 'Shopify token verification failed')
        return reply.code(400).send({ error: `Token invalid or store unreachable: ${err.message}` })
      }
    }
  )

  // Connect via Dev Dashboard client credentials (no OAuth redirect needed).
  // Only works when the marktech-flowvanta app and store are in the same Shopify org.
  // Frontend POSTs { clientId, shopDomain } — server exchanges credentials for a 24h token.
  app.post<{ Body: { clientId?: string; shopDomain: string } }>(
    '/shopify/connect-app',
    async (request, reply) => {
      const { clientId = 'default', shopDomain } = request.body
      if (!shopDomain) return reply.code(400).send({ error: 'shopDomain is required' })

      const normalized = normalizeShopDomain(shopDomain)
      try {
        const { accessToken, scope, expiresAt } = await getClientCredentialsToken(normalized)
        const shopInfo = await getShopInfo(normalized, accessToken)
        const tokenData = { shopDomain: normalized, accessToken, shopName: shopInfo.name, scope, expiresAt }
        shopifyTokenStore.set(clientId, tokenData)
        await dbSaveShopifyToken(clientId, tokenData).catch((err) =>
          app.log.error({ err: err.message }, 'Failed to persist Shopify token')
        )
        app.log.info({ clientId, shop: normalized, shopName: shopInfo.name }, 'Shopify client_credentials token stored')
        return { connected: true, shopDomain: normalized, shopName: shopInfo.name, expiresAt }
      } catch (err: any) {
        app.log.error({ err: err.message, shopDomain: normalized }, 'Shopify client credentials failed')
        return reply.code(400).send({ error: err.message })
      }
    }
  )

  // Disconnect — clears memory and DB row
  app.delete<{ Querystring: { clientId?: string } }>('/shopify/disconnect', async (request) => {
    const clientId = request.query.clientId ?? 'default'
    shopifyTokenStore.delete(clientId)
    await dbDeleteShopifyToken(clientId).catch((err) =>
      app.log.error({ err: err.message }, 'Failed to delete Shopify token from DB')
    )
    return { success: true }
  })
}

// ─── Data routes (JWT-protected) ─────────────────────────────────────────────

async function resolveShopifyToken(clientId: string): Promise<{ shopDomain: string; accessToken: string } | null> {
  let stored = shopifyTokenStore.get(clientId)
  if (!stored) {
    const row = await dbGetShopifyToken(clientId)
    if (row) { shopifyTokenStore.set(clientId, row); stored = row }
  }
  if (!stored) return null

  // Auto-refresh client_credentials tokens that are expired or within 5 minutes of expiry
  if (stored.expiresAt && stored.scope !== 'custom_app') {
    const msUntilExpiry = new Date(stored.expiresAt).getTime() - Date.now()
    if (msUntilExpiry < 5 * 60 * 1000) {
      try {
        const { accessToken, scope, expiresAt } = await getClientCredentialsToken(stored.shopDomain)
        const refreshed = { ...stored, accessToken, scope, expiresAt }
        shopifyTokenStore.set(clientId, refreshed)
        await dbSaveShopifyToken(clientId, refreshed).catch(() => {})
        return refreshed
      } catch {
        // If refresh fails, try the existing token — it may still be valid
      }
    }
  }

  return stored
}

export async function shopifyDataRoutes(app: FastifyInstance) {

  // Sessions & Landing Pages report
  // ShopifyQL: FROM sessions SHOW visitors, sessions, add-to-cart rate, bounce rate
  // Grouped by landing_page_type + landing_page_path, last N days
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/sessions',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      const token = await resolveShopifyToken(clientId)
      if (!token) return reply.code(401).send({ error: 'Shopify not connected for this client' })

      const days = parseInt(dateRange.replace(/\D/g, ''), 10) || 30
      const query =
        `FROM sessions ` +
        `SHOW online_store_visitors, sessions, added_to_cart_rate, bounce_rate ` +
        `WHERE landing_page_type IN ('Collection', 'Product') ` +
        `GROUP BY landing_page_type, landing_page_path ` +
        `WITH TOTALS ` +
        `ORDER BY sessions DESC ` +
        `SINCE -${days}d UNTIL today`

      try {
        const data = await runShopifyQL(token.shopDomain, token.accessToken, query)
        return { data, shopDomain: token.shopDomain, source: 'shopify_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'Shopify sessions query failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )

  // Sales report — hourly breakdown
  // ShopifyQL: FROM sales SHOW orders, gross_sales, discounts, returns, net_sales
  // Filters: billing_country != India + optional sales_channel
  app.get<{ Querystring: { clientId?: string; dateRange?: string; salesChannel?: string } }>(
    '/sales',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D', salesChannel } = request.query
      const token = await resolveShopifyToken(clientId)
      if (!token) return reply.code(401).send({ error: 'Shopify not connected for this client' })

      const days = parseInt(dateRange.replace(/\D/g, ''), 10) || 30

      // Sanitize salesChannel: allow only alphanumeric, spaces, hyphens, underscores, ampersands
      const safeChannel = salesChannel?.replace(/[^a-zA-Z0-9 \-_&]/g, '') ?? ''
      const channelClause = safeChannel
        ? ` AND sales_channel IN ('${safeChannel}')`
        : ''

      const query =
        `FROM sales ` +
        `SHOW orders, gross_sales, discounts, returns, net_sales ` +
        `WHERE billing_country != 'India'${channelClause} ` +
        `GROUP BY hour ` +
        `TIMESERIES hour ` +
        `SINCE -${days}d UNTIL today`

      try {
        const data = await runShopifyQL(token.shopDomain, token.accessToken, query)
        return { data, shopDomain: token.shopDomain, source: 'shopify_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'Shopify sales query failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )

  // Orders attributed to a channel (Meta/Google/Direct/Organic/Other) via
  // last-click UTM/referrer attribution — the source of truth for Attributed CPR, MER.
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/orders-by-channel',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      const token = await resolveShopifyToken(clientId)
      if (!token) return reply.code(401).send({ error: 'Shopify not connected for this client' })

      const days = parseInt(dateRange.replace(/\D/g, ''), 10) || 30
      try {
        const data = await getOrdersByChannel(token.shopDomain, token.accessToken, days)
        return { data, shopDomain: token.shopDomain, source: 'shopify_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'Shopify orders-by-channel query failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )

  // Shopify sessions attributed to Meta traffic (utm/referrer) — replaces "Reach".
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/meta-sessions',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      const token = await resolveShopifyToken(clientId)
      if (!token) return reply.code(401).send({ error: 'Shopify not connected for this client' })

      const days = parseInt(dateRange.replace(/\D/g, ''), 10) || 30
      try {
        const sessions = await getMetaSessions(token.shopDomain, token.accessToken, days)
        return { sessions, shopDomain: token.shopDomain, source: 'shopify_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'Shopify meta-sessions query failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )

  // Sales grouped by billing country — real dimension, not a hardcoded exclusion.
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/sales-by-country',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      const token = await resolveShopifyToken(clientId)
      if (!token) return reply.code(401).send({ error: 'Shopify not connected for this client' })

      const days = parseInt(dateRange.replace(/\D/g, ''), 10) || 30
      try {
        const data = await getSalesByCountry(token.shopDomain, token.accessToken, days)
        return { data, shopDomain: token.shopDomain, source: 'shopify_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'Shopify sales-by-country query failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )

  // Countries with real order history, for the country filter dropdown.
  app.get<{ Querystring: { clientId?: string } }>(
    '/countries',
    async (request, reply) => {
      const { clientId = 'default' } = request.query
      const token = await resolveShopifyToken(clientId)
      if (!token) return reply.code(401).send({ error: 'Shopify not connected for this client' })

      try {
        const countries = await getAvailableCountries(token.shopDomain, token.accessToken)
        return { countries }
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'Shopify countries query failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )

  // New-customer count (sampled from the Orders API) — feeds nCAC.
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/new-customers',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      const token = await resolveShopifyToken(clientId)
      if (!token) return reply.code(401).send({ error: 'Shopify not connected for this client' })

      const days = parseInt(dateRange.replace(/\D/g, ''), 10) || 30
      try {
        const data = await getNewCustomerCount(token.shopDomain, token.accessToken, days)
        return { data, shopDomain: token.shopDomain, source: 'shopify_api' }
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'Shopify new-customers query failed')
        return reply.code(500).send({ error: err.message })
      }
    }
  )
}
