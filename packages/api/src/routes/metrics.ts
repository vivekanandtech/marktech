import { FastifyInstance } from 'fastify'
import { computeOverviewMetrics, computeReconciliationTrend } from '../services/metrics-engine'
import { METRIC_DEFINITIONS, METRIC_SOURCES } from '../lib/metric-definitions'

export async function metricsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { clientId?: string; dateRange?: string; country?: string } }>(
    '/overview',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D', country } = request.query
      try {
        const data = await computeOverviewMetrics(clientId, dateRange, country)
        return data
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'computeOverviewMetrics failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to compute overview metrics' })
      }
    }
  )

  // Static metric metadata for the "Inspect" drawer — definition/formula/sources/caveat.
  app.get('/definitions', async () => {
    return { definitions: METRIC_DEFINITIONS, sources: METRIC_SOURCES }
  })

  app.get<{ Querystring: { clientId?: string; dateRange?: string } }>(
    '/reconciliation',
    async (request, reply) => {
      const { clientId = 'default', dateRange = '30D' } = request.query
      try {
        const data = await computeReconciliationTrend(clientId, dateRange)
        return data
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'computeReconciliationTrend failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to compute reconciliation trend' })
      }
    }
  )
}
