import { cronHandler } from '@/lib/cron'
import { runAutomationsJob } from '@/modules/automations/job'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json, every 5 minutes): delayed automation runs, date-based and scheduled recipes. */
export const GET = cronHandler('automations', (db) => runAutomationsJob(db))
