import { FastifyInstance } from 'fastify'
import { getMockSummaryMetrics, getMockChartData, getMockClients } from '../mock/data'
import { assertClientAccess } from '../lib/auth-guard'

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/clients', async () => ({ data: getMockClients() }))

  app.get<{
    Querystring: { clientId: string; dateRange: string; market: string }
  }>('/summary', async (request) => {
    const { clientId, dateRange, market } = request.query
    assertClientAccess(request, clientId)
    return { data: getMockSummaryMetrics(clientId, dateRange, market) }
  })

  app.get<{
    Querystring: { clientId: string; dateRange: string; market: string }
  }>('/chart-data', async (request) => {
    const { clientId, dateRange, market } = request.query
    assertClientAccess(request, clientId)
    return { data: getMockChartData(clientId, dateRange, market) }
  })
}
