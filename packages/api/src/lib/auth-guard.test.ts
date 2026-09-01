import { describe, it, expect } from 'vitest'
import { assertClientAccess, ForbiddenError, AuthUser, isValidAuthUser } from './auth-guard'
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

  // Regression test: a JWT signed under the old single-hardcoded-login system
  // ({userId, tenantId, role: 'agency_admin'}) still passes jwtVerify (same
  // secret) but has no clientIds field at all. Before this was guarded, this
  // threw "Cannot read properties of undefined (reading 'includes')" instead
  // of a clean 403 — a real crash a live session hit in production.
  it('denies rather than crashes when clientIds is missing entirely (old-token shape)', () => {
    const request = requestAs({ userId: 'u3', role: 'client_user' } as unknown as AuthUser)
    expect(() => assertClientAccess(request, 'client_a')).not.toThrow(TypeError)
    expect(() => assertClientAccess(request, 'client_a')).toThrow(ForbiddenError)
  })

  it('denies rather than crashes when clientIds is null', () => {
    const request = requestAs({ userId: 'u4', role: 'client_user', clientIds: null } as unknown as AuthUser)
    expect(() => assertClientAccess(request, 'client_a')).toThrow(ForbiddenError)
  })
})

describe('isValidAuthUser', () => {
  it('accepts a valid admin (clientIds not required)', () => {
    expect(isValidAuthUser({ userId: 'u1', role: 'admin' })).toBe(true)
    expect(isValidAuthUser({ userId: 'u1', role: 'admin', clientIds: [] })).toBe(true)
  })

  it('accepts a valid client_user with a clientIds array', () => {
    expect(isValidAuthUser({ userId: 'u2', role: 'client_user', clientIds: ['client_a'] })).toBe(true)
    expect(isValidAuthUser({ userId: 'u2', role: 'client_user', clientIds: [] })).toBe(true)
  })

  it('rejects the old pre-multi-tenant token shape (role agency_admin, no clientIds)', () => {
    expect(isValidAuthUser({ userId: 'u1', tenantId: 't1', role: 'agency_admin' })).toBe(false)
  })

  it('rejects a client_user whose clientIds is missing or not an array', () => {
    expect(isValidAuthUser({ userId: 'u2', role: 'client_user' })).toBe(false)
    expect(isValidAuthUser({ userId: 'u2', role: 'client_user', clientIds: 'client_a' })).toBe(false)
    expect(isValidAuthUser({ userId: 'u2', role: 'client_user', clientIds: null })).toBe(false)
  })

  it('rejects a completely malformed or missing user object without throwing', () => {
    expect(isValidAuthUser(null)).toBe(false)
    expect(isValidAuthUser(undefined)).toBe(false)
    expect(isValidAuthUser({})).toBe(false)
  })

  it('rejects an unrecognized role', () => {
    expect(isValidAuthUser({ userId: 'u1', role: 'superadmin', clientIds: [] })).toBe(false)
  })
})
