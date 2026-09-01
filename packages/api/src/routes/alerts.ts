import { FastifyInstance } from 'fastify'
import { getMockAlerts } from '../mock/data'
import { assertClientAccess } from '../lib/auth-guard'

export async function alertRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { clientId: string } }>('/', async (request) => {
    const { clientId } = request.query
    assertClientAccess(request, clientId)
    return { data: getMockAlerts(clientId) }
  })

  app.patch<{ Params: { id: string } }>('/:id/read', async (request) => {
    return { data: { id: request.params.id, isRead: true } }
  })
}
