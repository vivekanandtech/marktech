import { getPool } from './db'

// Used by the OAuth callback routes, which are necessarily public (the ad
// platform's own redirect can't carry a bearer token) — this is the one
// sanity check left on that leg: the state clientId must be a real client,
// not an arbitrary string, before we write any token against it.
export async function clientExists(clientId: string): Promise<boolean> {
  const db = getPool()
  if (!db) return true // no DB configured (local dev without Postgres) — don't block
  const res = await db.query(`SELECT 1 FROM clients WHERE id = $1`, [clientId])
  return (res.rowCount ?? 0) > 0
}
