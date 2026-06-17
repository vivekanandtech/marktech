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

  app.addHook('onRequest', async (request, reply) => {
    // Auth routes and health check are public
    if (request.url.startsWith('/auth') || request.url === '/health') return

    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Auth (login, Meta OAuth callback)
  app.register(authRoutes, { prefix: '/auth' })
  app.register(metaAuthRoutes, { prefix: '/auth' })

  // API data routes
  app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  app.register(campaignRoutes, { prefix: '/api/campaigns' })
  app.register(creativeRoutes, { prefix: '/api/creatives' })
  app.register(alertRoutes, { prefix: '/api/alerts' })
  app.register(metaDataRoutes, { prefix: '/api/meta' })

  return app
}
