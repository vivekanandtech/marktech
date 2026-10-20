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

// Meta's development-tier throttle ("User request limit reached", #17/#4/#80004…).
export function isRateLimitError(err: any): boolean {
  return /request limit|too many calls|rate limit|limit reached/i.test(err?.message ?? '')
}

const STALE_FALLBACK_MS = 24 * 60 * 60 * 1000
const inflight = new Map<string, Promise<any>>()

async function getCachedEntry<T>(key: string, maxAgeMs: number): Promise<{ payload: T; computedAt: Date } | null> {
  const db = getPool()
  if (!db) return null
  try {
    const res = await db.query(`SELECT payload, computed_at FROM metrics_cache WHERE cache_key = $1`, [key])
    if (!res.rows.length) return null
    const computedAt = new Date(res.rows[0].computed_at)
    if (Date.now() - computedAt.getTime() > maxAgeMs) return null
    return { payload: res.rows[0].payload as T, computedAt }
  } catch {
    return null
  }
}

// For Meta-backed responses on a small API allowance:
//  - fresh cache → no Meta call;
//  - identical concurrent requests share one Meta call instead of N;
//  - if Meta rate-limits, serve the last good copy (≤24h) tagged with
//    `staleAsOf` rather than an error — a few-minutes-old table beats none.
export async function cachedMetaFetch<T extends object>(
  key: string, ttlMs: number, fn: () => Promise<T>, opts: { shouldCache?: (data: T) => boolean } = {}
): Promise<T & { staleAsOf?: string }> {
  const fresh = await getCachedEntry<T>(key, ttlMs)
  if (fresh) return fresh.payload

  const pending = inflight.get(key)
  if (pending) return pending

  const run = (async () => {
    try {
      const data = await fn()
      if (opts.shouldCache?.(data) ?? true) await setCachedResponse(key, data)
      return data
    } catch (err) {
      if (isRateLimitError(err)) {
        const stale = await getCachedEntry<T>(key, STALE_FALLBACK_MS)
        if (stale) return { ...stale.payload, staleAsOf: stale.computedAt.toISOString() }
      }
      throw err
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, run)
  return run
}
