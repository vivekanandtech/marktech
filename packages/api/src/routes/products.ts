import { FastifyInstance } from 'fastify'
import { computeProductPerformance } from '../services/product-performance'
import { assertClientAccess } from '../lib/auth-guard'

export async function productsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/performance',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)
      try {
        const data = await computeProductPerformance(clientId, dateRange)
        return data
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'computeProductPerformance failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to compute product performance' })
      }
    }
  )
}
