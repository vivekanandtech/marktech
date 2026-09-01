import { FastifyInstance } from 'fastify'
import { getMockCreatives } from '../mock/data'
import { assertClientAccess } from '../lib/auth-guard'

export async function creativeRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { clientId: string; platform: string; dateRange: string }
  }>('/', async (request) => {
    const { clientId, platform, dateRange } = request.query
    assertClientAccess(request, clientId)
    return { data: getMockCreatives(clientId, platform, dateRange) }
  })
}
