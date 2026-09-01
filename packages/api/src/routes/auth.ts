import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { getPool } from '../lib/db'

interface UserRow {
  id: string
  email: string
  password_hash: string
  name: string
  role: 'admin' | 'client_user'
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const db = getPool()
  if (!db) return null
  const res = await db.query<UserRow>(`SELECT id, email, password_hash, name, role FROM users WHERE email = $1`, [email])
  return res.rows[0] ?? null
}

async function getClientIdsForUser(userId: string): Promise<string[]> {
  const db = getPool()
  if (!db) return []
  const res = await db.query<{ client_id: string }>(`SELECT client_id FROM user_clients WHERE user_id = $1`, [userId])
  return res.rows.map((r) => r.client_id)
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>('/login', async (request, reply) => {
    const { email, password } = request.body
    const user = await findUserByEmail(email)
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const clientIds = user.role === 'admin' ? [] : await getClientIdsForUser(user.id)

    const token = app.jwt.sign(
      { userId: user.id, role: user.role, clientIds },
      { expiresIn: '30d' }
    )
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, clientIds } }
  })

  app.post('/logout', async () => ({ success: true }))
}
