import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const metaIngestQueue = new Queue('meta-ingest', { connection })
export const googleIngestQueue = new Queue('google-ingest', { connection })
export const alertCheckQueue = new Queue('alert-check', { connection })
export const executionQueue = new Queue('execution', { connection })

export async function scheduleRecurringJobs() {
  // Meta ingestion: every 30 minutes for active accounts
  await metaIngestQueue.upsertJobScheduler('meta-ingest-active', { every: 30 * 60 * 1000 }, {
    name: 'ingest-all-active',
    data: { accountType: 'active' },
  })

  // Google ingestion: every 30 minutes
  await googleIngestQueue.upsertJobScheduler('google-ingest-active', { every: 30 * 60 * 1000 }, {
    name: 'ingest-all-active',
    data: { accountType: 'active' },
  })

  // Alert checks: every 15 minutes
  await alertCheckQueue.upsertJobScheduler('alert-check', { every: 15 * 60 * 1000 }, {
    name: 'check-all-accounts',
    data: {},
  })

  console.log('Recurring jobs scheduled')
}
