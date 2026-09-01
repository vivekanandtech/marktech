import { FastifyInstance } from 'fastify'
import { generateInsights, InsightInput } from '../services/insights-engine'
import {
  buildCrossChannelInput, generateCrossChannelInsights,
  dbSaveCrossChannelInsights, dbGetCrossChannelInsights, dbUpdateRecommendationStatus,
  RecommendationStatus,
} from '../services/cross-channel-insights'
import { assertClientAccess } from '../lib/auth-guard'

export async function insightsRoutes(app: FastifyInstance) {
  app.post<{ Body: InsightInput }>('/generate', async (request, reply) => {
    try {
      const insights = await generateInsights(request.body)
      return { insights }
    } catch (err: any) {
      app.log.error({ err: err.message }, 'generateInsights failed')
      return reply.code(500).send({ error: err.message ?? 'Failed to generate insights' })
    }
  })

  // Cross-channel ranked recommendations — the "crux" insights engine, spanning
  // Meta + Google + Shopify truth metrics rather than Meta alone.
  app.post<{ Body: { clientId?: string; dateRange?: string } }>('/cross-channel/generate', async (request, reply) => {
    const { clientId = 'default', dateRange = '30D' } = request.body ?? {}
    assertClientAccess(request, clientId)
    try {
      const input = await buildCrossChannelInput(clientId, dateRange)
      const recommendations = await generateCrossChannelInsights(input)
      const payload = await dbSaveCrossChannelInsights(clientId, dateRange, recommendations)
      return payload
    } catch (err: any) {
      app.log.error({ err: err.message, clientId }, 'generateCrossChannelInsights failed')
      return reply.code(500).send({ error: err.message ?? 'Failed to generate cross-channel insights' })
    }
  })

  // Avoids an LLM call on every page load — returns whatever was last generated.
  app.get<{ Querystring: { clientId?: string } }>('/cross-channel/latest', async (request, reply) => {
    const { clientId = 'default' } = request.query
    assertClientAccess(request, clientId)
    try {
      const payload = await dbGetCrossChannelInsights(clientId)
      return { payload }
    } catch (err: any) {
      app.log.error({ err: err.message, clientId }, 'dbGetCrossChannelInsights failed')
      return reply.code(500).send({ error: err.message ?? 'Failed to load cross-channel insights' })
    }
  })

  app.patch<{ Params: { clientId: string; rank: string }; Body: { status: RecommendationStatus } }>(
    '/cross-channel/:clientId/:rank/status',
    async (request, reply) => {
      const { clientId, rank } = request.params
      const { status } = request.body
      assertClientAccess(request, clientId)
      try {
        const payload = await dbUpdateRecommendationStatus(clientId, Number(rank), status)
        if (!payload) return reply.code(404).send({ error: 'No cross-channel insights found for this client' })
        return payload
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'dbUpdateRecommendationStatus failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to update recommendation status' })
      }
    }
  )
}
