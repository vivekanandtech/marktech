import { Worker, Job } from 'bullmq'
import { connection } from '../queues'

interface GoogleIngestJobData {
  accountType: 'active' | 'all'
  tenantId?: string
  customerId?: string
}

// TODO: Replace with real Google Ads API calls once developer token is approved
// Requires: Standard Access developer token (1-2 weeks after application)
// Library: google-ads-api npm package with GAQL
// MCC (Manager Account) needed to query multiple client accounts

async function processGoogleIngest(job: Job<GoogleIngestJobData>) {
  const { tenantId, customerId } = job.data
  console.log(`[Google Ingest] Starting job ${job.id} — tenant: ${tenantId ?? 'all'}, customer: ${customerId ?? 'all'}`)

  // STUB: Will run GAQL queries when token is available
  // Key queries:
  // 1. Campaign performance (impressions, clicks, cost, conversions, roas)
  // 2. Ad group performance
  // 3. Ad performance (RSA assets)
  // 4. Search terms report (weekly) — for negative keyword opportunities
  // 5. Geographic performance — for India vs International split
  // 6. Asset performance report — for RSA asset ratings

  await job.updateProgress(100)
  console.log(`[Google Ingest] Job ${job.id} complete (stub)`)
}

export function startGoogleIngestWorker() {
  const worker = new Worker<GoogleIngestJobData>('google-ingest', processGoogleIngest, {
    connection,
    concurrency: 3,
  })

  worker.on('completed', (job) => console.log(`[Google] Job ${job.id} completed`))
  worker.on('failed', (job, err) => console.error(`[Google] Job ${job?.id} failed:`, err.message))

  return worker
}
