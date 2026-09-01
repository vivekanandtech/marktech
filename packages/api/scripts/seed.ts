// One-time (idempotent) seed: backfills a `clients` row for every client_id
// already in use across the token tables, and creates the initial admin user.
// Run once per environment: ADMIN_EMAIL=... ADMIN_PASSWORD=... npx ts-node scripts/seed.ts
//
// Client names are best-effort (shop name / ad account name / the raw id as a
// last resort) since no canonical name existed server-side before this table —
// rename them for real from the admin panel once it exists (Phase 3).
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { getPool, initDb } from '../src/lib/db'

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4']
function colorFor(id: string): string {
  const hash = [...id].reduce((h, c) => h + c.charCodeAt(0), 0)
  return PALETTE[hash % PALETTE.length]!
}

async function discoverClientIds(): Promise<Map<string, string>> {
  const db = getPool()!
  const names = new Map<string, string>()

  const shopify = await db.query<{ client_id: string; shop_name: string | null; shop_domain: string }>(
    `SELECT client_id, shop_name, shop_domain FROM shopify_tokens`
  )
  for (const row of shopify.rows) names.set(row.client_id, row.shop_name || row.shop_domain.replace('.myshopify.com', ''))

  const meta = await db.query<{ client_id: string; ad_accounts_json: any }>(
    `SELECT client_id, ad_accounts_json FROM meta_tokens`
  )
  for (const row of meta.rows) {
    if (names.has(row.client_id)) continue
    const firstAccount = Array.isArray(row.ad_accounts_json) ? row.ad_accounts_json[0] : null
    if (firstAccount?.name) names.set(row.client_id, firstAccount.name)
  }

  const google = await db.query<{ client_id: string; customer_name: string | null }>(
    `SELECT client_id, customer_name FROM google_tokens`
  )
  for (const row of google.rows) {
    if (names.has(row.client_id) || !row.customer_name) continue
    names.set(row.client_id, row.customer_name)
  }

  // Any client_id present in a token table but with no derivable name yet
  const allIds = new Set([...shopify.rows.map((r) => r.client_id), ...meta.rows.map((r) => r.client_id), ...google.rows.map((r) => r.client_id)])
  for (const id of allIds) if (!names.has(id)) names.set(id, id)

  return names
}

async function main() {
  await initDb()
  const db = getPool()
  if (!db) throw new Error('DATABASE_URL not set')

  const discovered = await discoverClientIds()
  for (const [id, name] of discovered) {
    await db.query(
      `INSERT INTO clients (id, name, logo_initials, logo_color) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id, name, initials(name), colorFor(id)]
    )
    console.log(`[seed] client ${id} -> "${name}"`)
  }

  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminEmail || !adminPassword) {
    console.log('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin user creation')
  } else {
    const hash = await bcrypt.hash(adminPassword, 10)
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, 'admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [`user_admin_${Date.now()}`, adminEmail, hash, 'Admin']
    )
    console.log(`[seed] admin user ready: ${adminEmail}`)
  }

  console.log('[seed] done')
  process.exit(0)
}

main().catch((err) => { console.error('[seed] failed', err); process.exit(1) })
