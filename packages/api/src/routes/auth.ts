import { FastifyInstance } from 'fastify'

const DEMO_USERS = [
  {
    id: 'user_1',
    email: 'admin@velora.com',
    password: 'demo1234',
    name: 'Arjun Sharma',
    role: 'agency_admin',
    tenantId: 'tenant_1',
  },
]

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>('/login', async (request, reply) => {
    const { email, password } = request.body
    const user = DEMO_USERS.find((u) => u.email === email && u.password === password)
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      { expiresIn: '7d' }
    )
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
  })

  app.post('/logout', async () => ({ success: true }))
}
