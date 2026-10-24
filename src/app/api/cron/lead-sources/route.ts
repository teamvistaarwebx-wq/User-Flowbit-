import { cronHandler } from '@/lib/cron'
import { runLeadSourcesJob } from '@/modules/orbit/capture/indiamart-job'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json, every 15 minutes): pulls IndiaMART enquiries into Orbit for workspaces that set it up. */
export const GET = cronHandler('lead-sources', (db) => runLeadSourcesJob(db))
