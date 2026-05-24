import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import { dashboardRoutes } from './routes/dashboard'
import { campaignRoutes } from './routes/campaigns'
import { creativeRoutes } from './routes/creatives'
import { alertRoutes } from './routes/alerts'
import { authRoutes } from './routes/auth'

export function buildApp() {
  const app = Fastify({ logger: { level: 'info' } })

  app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev_secret_change_in_production',
  })

  app.register(sensible)

  app.addHook('onRequest', async (request, reply) => {
    if (
      request.url.startsWith('/auth') ||
      request.url === '/health'
    ) return

    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  app.register(authRoutes, { prefix: '/auth' })
  app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  app.register(campaignRoutes, { prefix: '/api/campaigns' })
  app.register(creativeRoutes, { prefix: '/api/creatives' })
  app.register(alertRoutes, { prefix: '/api/alerts' })

  return app
}
