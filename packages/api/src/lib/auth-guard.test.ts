import { describe, it, expect } from 'vitest'
import { assertClientAccess, ForbiddenError, AuthUser } from './auth-guard'
import { FastifyRequest } from 'fastify'

function requestAs(user: AuthUser): FastifyRequest {
  return { user } as unknown as FastifyRequest
}

describe('assertClientAccess', () => {
  it('allows an admin to access any client_id', () => {
    const request = requestAs({ userId: 'u1', role: 'admin', clientIds: [] })
    expect(() => assertClientAccess(request, 'client_anything')).not.toThrow()
  })

  it('allows a client_user to access a client_id in their own list', () => {
    const request = requestAs({ userId: 'u2', role: 'client_user', clientIds: ['client_a', 'client_b'] })
    expect(() => assertClientAccess(request, 'client_a')).not.toThrow()
  })

  it('throws ForbiddenError for a client_user accessing a client_id not in their list', () => {
    const request = requestAs({ userId: 'u2', role: 'client_user', clientIds: ['client_a'] })
    expect(() => assertClientAccess(request, 'client_b')).toThrow(ForbiddenError)
  })

  it('ForbiddenError carries a 403 status code', () => {
    const request = requestAs({ userId: 'u2', role: 'client_user', clientIds: [] })
    try {
      assertClientAccess(request, 'client_x')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError)
      expect((err as ForbiddenError).statusCode).toBe(403)
    }
  })
})
