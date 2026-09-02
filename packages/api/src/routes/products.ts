import { FastifyInstance } from 'fastify'
import { computeProductPerformance } from '../services/product-performance'
import { assertClientAccess } from '../lib/auth-guard'
import { getCachedResponse, setCachedResponse } from '../lib/response-cache'

// Longer than Meta/Google's campaign cache (5 min) — this is the most
// expensive of the three: two full Shopify sales/session queries (current +
// previous window), a paginated fetch of the entire product catalog, and a
// Google Shopping query, then an in-memory join across ~1,000+ products. The
// product catalog itself changes far slower than ad performance does, so a
// longer window here doesn't cost meaningful freshness.
const PRODUCTS_CACHE_TTL_MS = 10 * 60 * 1000

export async function productsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/performance',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      assertClientAccess(request, clientId)

      const cacheKey = `products:performance:${clientId}:${dateRange}`
      const cached = await getCachedResponse<any>(cacheKey, PRODUCTS_CACHE_TTL_MS)
      if (cached) return cached

      try {
        const data = await computeProductPerformance(clientId, dateRange)
        await setCachedResponse(cacheKey, data)
        return data
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'computeProductPerformance failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to compute product performance' })
      }
    }
  )
}
