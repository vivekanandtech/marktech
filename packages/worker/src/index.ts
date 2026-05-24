import 'dotenv/config'
import { scheduleRecurringJobs } from './queues'
import { startMetaIngestWorker } from './jobs/meta-ingest'
import { startGoogleIngestWorker } from './jobs/google-ingest'

async function main() {
  console.log('Starting Marktech worker...')

  const metaWorker = startMetaIngestWorker()
  const googleWorker = startGoogleIngestWorker()

  await scheduleRecurringJobs()

  console.log('All workers running. Waiting for jobs...')

  process.on('SIGTERM', async () => {
    console.log('Shutting down workers...')
    await metaWorker.close()
    await googleWorker.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Worker startup failed:', err)
  process.exit(1)
})
