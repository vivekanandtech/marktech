import { FastifyInstance } from 'fastify'
import { getMockCreatives } from '../mock/data'

export async function creativeRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { clientId: string; platform: string; dateRange: string }
  }>('/', async (request) => {
    const { clientId, platform, dateRange } = request.query
    return { data: getMockCreatives(clientId, platform, dateRange) }
  })
}
