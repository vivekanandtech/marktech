import { Worker, Job } from 'bullmq'
import { connection } from '../queues'

interface MetaIngestJobData {
  accountType: 'active' | 'all'
  tenantId?: string
  adAccountId?: string
}

// TODO: Replace with real Meta Marketing API calls once tokens are approved
// Required permissions: ads_read (immediate) + ads_management (after app review)
// Docs: https://developers.facebook.com/docs/marketing-api/

async function processMetaIngest(job: Job<MetaIngestJobData>) {
  const { tenantId, adAccountId } = job.data
  console.log(`[Meta Ingest] Starting job ${job.id} — tenant: ${tenantId ?? 'all'}, account: ${adAccountId ?? 'all'}`)

  // STUB: Will pull from Meta API when token is available
  // Hierarchy: AdAccount → Campaign → AdSet → Ad
  // Fields to fetch per campaign:
  //   name, status, objective, daily_budget, lifetime_budget, buying_type
  //   Insights: spend, impressions, reach, clicks, ctr, cpm, cpc, frequency,
  //             actions (purchase), action_values (purchase_value), roas
  // Attribution windows: 1d_click, 7d_click, 1d_view (store separately)
  // Geo breakdown: country (for India vs International split)

  await job.updateProgress(100)
  console.log(`[Meta Ingest] Job ${job.id} complete (stub)`)
}

export function startMetaIngestWorker() {
  const worker = new Worker<MetaIngestJobData>('meta-ingest', processMetaIngest, {
    connection,
    concurrency: 3,
  })

  worker.on('completed', (job) => console.log(`[Meta] Job ${job.id} completed`))
  worker.on('failed', (job, err) => console.error(`[Meta] Job ${job?.id} failed:`, err.message))

  return worker
}
