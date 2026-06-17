import 'dotenv/config'
import { buildApp } from './app'
import { initDb } from './lib/db'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

async function start() {
  await initDb()
  const app = buildApp()
  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`API server running at http://localhost:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
