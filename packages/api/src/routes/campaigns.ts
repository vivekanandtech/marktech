import { FastifyInstance } from 'fastify'
import { getMockCampaigns } from '../mock/data'
import { assertClientAccess } from '../lib/auth-guard'

export async function campaignRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { clientId: string; platform: string; market: string; dateRange: string }
  }>('/', async (request) => {
    const { clientId, platform, market, dateRange } = request.query
    assertClientAccess(request, clientId)
    return { data: getMockCampaigns(clientId, platform, market, dateRange) }
  })
}
