import { FastifyInstance } from 'fastify'
import {
  generateActionables, dbGetActionables, dbUpdateActionableStatus, ActionableStatus,
} from '../services/actionables-engine'
import { assertClientAccess } from '../lib/auth-guard'

const STATUSES = new Set<ActionableStatus>(['new', 'done', 'dismissed'])

export async function actionablesRoutes(app: FastifyInstance) {
  // Returns whatever was last generated — no Meta/Shopify/LLM calls on page load.
  app.get<{ Querystring: { clientId?: string } }>('/latest', async (request, reply) => {
    const { clientId = 'default' } = request.query
    assertClientAccess(request, clientId)
    try {
      return { payload: await dbGetActionables(clientId) }
    } catch (err: any) {
      app.log.error({ err: err.message, clientId }, 'dbGetActionables failed')
      return reply.code(500).send({ error: err.message ?? 'Failed to load actionables' })
    }
  })

  app.post<{ Body: { clientId?: string; dateRange?: string } }>('/generate', async (request, reply) => {
    const { clientId = 'default', dateRange = '30D' } = request.body ?? {}
    assertClientAccess(request, clientId)
    try {
      return await generateActionables(clientId, dateRange)
    } catch (err: any) {
      app.log.error({ err: err.message, clientId }, 'generateActionables failed')
      return reply.code(500).send({ error: err.message ?? 'Failed to generate actionables' })
    }
  })

  app.patch<{ Params: { clientId: string }; Body: { id: string; status: ActionableStatus } }>(
    '/:clientId/status',
    async (request, reply) => {
      const { clientId } = request.params
      const { id, status } = request.body ?? ({} as any)
      assertClientAccess(request, clientId)
      if (!id || !STATUSES.has(status)) return reply.code(400).send({ error: 'id and a valid status are required' })
      try {
        const payload = await dbUpdateActionableStatus(clientId, id, status)
        if (!payload) return reply.code(404).send({ error: 'No actionables found for this client' })
        return payload
      } catch (err: any) {
        app.log.error({ err: err.message, clientId }, 'dbUpdateActionableStatus failed')
        return reply.code(500).send({ error: err.message ?? 'Failed to update status' })
      }
    }
  )
}
