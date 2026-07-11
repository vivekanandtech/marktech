import { FastifyInstance } from 'fastify'
import { generateInsights, InsightInput } from '../services/insights-engine'

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
}
