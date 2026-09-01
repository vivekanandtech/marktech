import { FastifyRequest } from 'fastify'

export type Role = 'admin' | 'client_user'

export interface AuthUser {
  userId: string
  role: Role
  clientIds: string[]
}

// A 403 that route handlers can just `throw` — Fastify's default error
// handler serializes it with the right status code.
export class ForbiddenError extends Error {
  statusCode = 403
}

// Every route that takes a clientId query/body param must call this before
// touching that client's data — closes the gap where any valid login could
// read/write any client just by knowing its id (nothing enforced this before).
export function assertClientAccess(request: FastifyRequest, clientId: string): void {
  const user = request.user as AuthUser
  if (user.role === 'admin') return
  // A token signed before clientIds existed (the old single-hardcoded-login
  // system) decodes fine — same JWT secret — but carries none of these
  // claims. Treat that as unauthorized rather than crashing on .includes().
  if (Array.isArray(user.clientIds) && user.clientIds.includes(clientId)) return
  throw new ForbiddenError(`Not authorized for client ${clientId}`)
}
