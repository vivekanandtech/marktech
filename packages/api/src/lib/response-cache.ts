// Generic response cache, reusing the same `metrics_cache` table already
// proven out by metrics-engine.ts's Overview caching (left untouched here —
// this is a separate, independent implementation against the same table so
// adding new cached endpoints can't risk regressing the already-working
// Overview cache). `cache_key` is just a string, `payload` is JSONB, so any
// JSON-serializable response shape can reuse this without a new migration.
import { getPool } from './db'

export async function getCachedResponse<T>(key: string, ttlMs: number): Promise<T | null> {
  const db = getPool()
  if (!db) return null
  try {
    const res = await db.query(
      `SELECT payload, computed_at FROM metrics_cache WHERE cache_key = $1`, [key]
    )
    if (!res.rows.length) return null
    const { payload, computed_at } = res.rows[0]
    if (Date.now() - new Date(computed_at).getTime() > ttlMs) return null
    return payload as T
  } catch {
    return null  // cache is a speed optimization, never a hard dependency
  }
}

export async function setCachedResponse<T>(key: string, payload: T): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO metrics_cache (cache_key, payload, computed_at) VALUES ($1, $2, NOW())
     ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
    [key, JSON.stringify(payload)]
  ).catch(() => {})  // never let a cache write failure break the real response
}
