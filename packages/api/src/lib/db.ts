import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Render managed Postgres requires SSL on external URLs.
      // Use the Internal URL from the Render dashboard to skip SSL entirely.
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    pool.on('error', (err) => console.error('PostgreSQL pool error', err))
  }
  return pool
}

// Run once at startup — creates the meta_tokens table if it doesn't exist yet.
export async function initDb(): Promise<void> {
  const db = getPool()
  if (!db) {
    console.warn('[db] DATABASE_URL not set — Meta tokens will not persist across restarts')
    return
  }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        industry      TEXT,
        logo_initials TEXT,
        logo_color    TEXT,
        settings      JSONB NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name          TEXT NOT NULL,
        role          TEXT NOT NULL CHECK (role IN ('admin', 'client_user')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_clients (
        user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, client_id)
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS meta_tokens (
        client_id               TEXT PRIMARY KEY,
        access_token            TEXT NOT NULL,
        meta_user_id            TEXT,
        ad_account_ids          TEXT[],
        ad_accounts_json        JSONB,
        selected_ad_account_id  TEXT,
        expires_at              TIMESTAMPTZ,
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    // Add columns that may be missing on existing tables
    await db.query(`ALTER TABLE meta_tokens ADD COLUMN IF NOT EXISTS ad_accounts_json       JSONB`)
    await db.query(`ALTER TABLE meta_tokens ADD COLUMN IF NOT EXISTS selected_ad_account_id TEXT`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS shopify_tokens (
        client_id    TEXT PRIMARY KEY,
        shop_domain  TEXT NOT NULL,
        access_token TEXT NOT NULL,
        shop_name    TEXT,
        scope        TEXT,
        expires_at   TIMESTAMPTZ,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    // Add expires_at column to existing tables that were created without it
    await db.query(`ALTER TABLE shopify_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS google_tokens (
        client_id            TEXT PRIMARY KEY,
        refresh_token        TEXT NOT NULL,
        access_token         TEXT,
        access_token_expiry  TIMESTAMPTZ,
        customer_id          TEXT,
        customer_name        TEXT,
        customers_json       JSONB,
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS metrics_cache (
        cache_key   TEXT PRIMARY KEY,
        payload     JSONB NOT NULL,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS cross_channel_insights (
        client_id    TEXT PRIMARY KEY,
        date_range   TEXT NOT NULL,
        payload      JSONB NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    console.log('[db] Connected and ready')
  } catch (err) {
    console.error('[db] Failed to initialise:', err)
  }
}
