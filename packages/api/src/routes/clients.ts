import { FastifyInstance } from 'fastify'
import { getPool } from '../lib/db'
import { AuthUser } from '../lib/auth-guard'

interface ClientRow {
  id: string
  name: string
  industry: string | null
  logo_initials: string | null
  logo_color: string | null
  settings: Record<string, unknown> | null
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4']
function colorFor(id: string): string {
  const hash = [...id].reduce((h, c) => h + c.charCodeAt(0), 0)
  return PALETTE[hash % PALETTE.length]!
}

// The frontend never needs to see a Shopify app's client secret again once
// it's saved (same principle as any other API-key UI: show it once, then
// redact) — strip it before any settings payload leaves the server.
function redactSettings(settings: Record<string, any> | null | undefined): Record<string, unknown> {
  const s = settings ?? {}
  if (!s.shopifyApp) return s
  return { ...s, shopifyApp: { clientId: s.shopifyApp.clientId, configured: true } }
}

export async function clientsRoutes(app: FastifyInstance) {
  // Scoped list: admin sees every client, a client_user sees only their own.
  // Replaces the old browser-local "clients" concept — this is the server's
  // authoritative answer to "which clients can this login even see."
  app.get('/', async (request) => {
    const user = request.user as AuthUser
    const db = getPool()
    if (!db) return { clients: [] }

    // Oldest first — a freshly-created (often still-empty, mid-setup) client
    // sorting last matters here specifically because the frontend falls back
    // to "the first client in this list" when nothing is explicitly selected;
    // newest-first would let a brand-new, unconnected client silently hijack
    // that default.
    const res = user.role === 'admin'
      ? await db.query<ClientRow>(`SELECT id, name, industry, logo_initials, logo_color, settings FROM clients ORDER BY created_at ASC`)
      : await db.query<ClientRow>(
          `SELECT c.id, c.name, c.industry, c.logo_initials, c.logo_color, c.settings
           FROM clients c JOIN user_clients uc ON uc.client_id = c.id
           WHERE uc.user_id = $1 ORDER BY c.created_at ASC`,
          [user.userId]
        )

    return {
      clients: res.rows.map((r) => ({
        id: r.id, name: r.name, industry: r.industry ?? '',
        logoInitials: r.logo_initials ?? initials(r.name), logoColor: r.logo_color ?? colorFor(r.id),
        settings: redactSettings(r.settings),
      })),
    }
  })

  // Admin-only: create a new client.
  app.post<{ Body: { name: string; industry?: string } }>('/', async (request, reply) => {
    const user = request.user as AuthUser
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { name, industry } = request.body
    if (!name?.trim()) return reply.code(400).send({ error: 'name is required' })

    const id = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const db = getPool()
    if (!db) return reply.code(503).send({ error: 'Database unavailable' })

    await db.query(
      `INSERT INTO clients (id, name, industry, logo_initials, logo_color) VALUES ($1, $2, $3, $4, $5)`,
      [id, name.trim(), industry?.trim() ?? null, initials(name), colorFor(id)]
    )
    return { id, name: name.trim(), industry: industry?.trim() ?? '', logoInitials: initials(name), logoColor: colorFor(id) }
  })

  // Admin-only: update a client's settings — metric thresholds, and/or this
  // client's own Shopify app credentials (Client ID/Secret from their
  // distributable Shopify app, so their store's OAuth install doesn't have
  // to share the one global app every other client uses). Shallow-merged
  // into the existing settings JSONB — the frontend always sends the
  // complete object it's editing for each key present, so this can't
  // silently drop a metric/field that wasn't included in this particular save.
  app.patch<{
    Params: { id: string }
    Body: {
      thresholds?: Record<string, { good: number; bad: number }>
      shopifyApp?: { clientId: string; clientSecret: string }
    }
  }>(
    '/:id/settings',
    async (request, reply) => {
      const user = request.user as AuthUser
      if (user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
      const db = getPool()
      if (!db) return reply.code(503).send({ error: 'Database unavailable' })

      const patch: Record<string, unknown> = {}
      if (request.body.thresholds) patch.thresholds = request.body.thresholds
      if (request.body.shopifyApp) {
        const { clientId, clientSecret } = request.body.shopifyApp
        if (!clientId?.trim() || !clientSecret?.trim()) {
          return reply.code(400).send({ error: 'Both Client ID and Client Secret are required' })
        }
        patch.shopifyApp = { clientId: clientId.trim(), clientSecret: clientSecret.trim() }
      }

      const res = await db.query(
        `UPDATE clients SET settings = settings || $2::jsonb WHERE id = $1 RETURNING settings`,
        [request.params.id, JSON.stringify(patch)]
      )
      if (res.rowCount === 0) return reply.code(404).send({ error: 'Client not found' })
      return { settings: redactSettings(res.rows[0].settings) }
    }
  )

  // Admin-only: list the logins scoped to a specific client.
  app.get<{ Params: { id: string } }>('/:id/users', async (request, reply) => {
    const user = request.user as AuthUser
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const db = getPool()
    if (!db) return { users: [] }
    const res = await db.query(
      `SELECT u.id, u.email, u.name FROM users u
       JOIN user_clients uc ON uc.user_id = u.id
       WHERE uc.client_id = $1 ORDER BY u.created_at ASC`,
      [request.params.id]
    )
    return { users: res.rows }
  })

  // Admin-only: create a client_user login scoped to this client.
  app.post<{ Params: { id: string }; Body: { name: string; email: string; password: string } }>(
    '/:id/users',
    async (request, reply) => {
      const user = request.user as AuthUser
      if (user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
      const { name, email, password } = request.body
      if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
        return reply.code(400).send({ error: 'name, email, and an 8+ character password are required' })
      }
      const db = getPool()
      if (!db) return reply.code(503).send({ error: 'Database unavailable' })

      const bcrypt = await import('bcryptjs')
      const hash = await bcrypt.hash(password, 10)
      const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      try {
        await db.query(
          `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, 'client_user')`,
          [userId, email.trim().toLowerCase(), hash, name.trim()]
        )
        await db.query(`INSERT INTO user_clients (user_id, client_id) VALUES ($1, $2)`, [userId, request.params.id])
        return { id: userId, email: email.trim().toLowerCase(), name: name.trim() }
      } catch (err: any) {
        if (err.code === '23505') return reply.code(409).send({ error: 'A user with that email already exists' })
        throw err
      }
    }
  )
}
