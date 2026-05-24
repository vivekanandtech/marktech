import { FastifyInstance } from 'fastify'
import { getMockCampaigns } from '../mock/data'

export async function campaignRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { clientId: string; platform: string; market: string; dateRange: string }
  }>('/', async (request) => {
    const { clientId, platform, market, dateRange } = request.query
    return { data: getMockCampaigns(clientId, platform, market, dateRange) }
  })
}
