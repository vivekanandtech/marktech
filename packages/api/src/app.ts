import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import { dashboardRoutes } from './routes/dashboard'
import { campaignRoutes } from './routes/campaigns'
import { creativeRoutes } from './routes/creatives'
import { alertRoutes } from './routes/alerts'
import { authRoutes } from './routes/auth'
import { metaAuthRoutes, metaDataRoutes } from './routes/meta-auth'
import { shopifyAuthRoutes, shopifyDataRoutes } from './routes/shopify'
import { googleAuthRoutes, googleDataRoutes } from './routes/google-auth'
import { insightsRoutes } from './routes/insights'
import { metricsRoutes } from './routes/metrics'
import { clientsRoutes } from './routes/clients'
import { isValidAuthUser } from './lib/auth-guard'

export function buildApp() {
  const app = Fastify({ logger: { level: 'info' } })

  const allowedOrigins = new Set([
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:5174',
  ].filter(Boolean) as string[])

  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) cb(null, true)
      else cb(new Error('Not allowed by CORS'), false)
    },
    credentials: true,
  })

  app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev_secret_change_in_production',
  })

  app.register(sensible)

  // Only login and the three OAuth callbacks are genuinely public — a callback
  // is the ad platform's own redirect hitting our server directly, so it can't
  // carry a bearer token. Everything else under /auth (status, disconnect,
  // select-account, and the connect-initiating routes) previously also matched
  // a blanket "starts with /auth" exemption, meaning any clientId's tokens
  // could be read/changed by an unauthenticated caller. Narrowed to an
  // allowlist of exactly the paths that must stay public.
  const PUBLIC_PATHS = new Set([
    '/health', '/auth/login',
    '/auth/meta/callback', '/auth/google/callback', '/auth/shopify/callback',
  ])

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]
    if (PUBLIC_PATHS.has(path)) return

    try {
      await request.jwtVerify()
      if (!isValidAuthUser(request.user)) {
        return reply.code(401).send({ error: 'Session from a previous version — please log in again' })
      }
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Auth (login, Meta OAuth callback, Shopify OAuth callback)
  app.register(authRoutes, { prefix: '/auth' })
  app.register(metaAuthRoutes, { prefix: '/auth' })
  app.register(shopifyAuthRoutes, { prefix: '/auth' })
  app.register(googleAuthRoutes, { prefix: '/auth' })

  // API data routes
  app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  app.register(campaignRoutes, { prefix: '/api/campaigns' })
  app.register(creativeRoutes, { prefix: '/api/creatives' })
  app.register(alertRoutes, { prefix: '/api/alerts' })
  app.register(metaDataRoutes, { prefix: '/api/meta' })
  app.register(shopifyDataRoutes, { prefix: '/api/shopify' })
  app.register(googleDataRoutes, { prefix: '/api/google' })
  app.register(insightsRoutes, { prefix: '/api/insights' })
  app.register(metricsRoutes, { prefix: '/api/metrics' })
  app.register(clientsRoutes, { prefix: '/api/clients' })

  return app
}
