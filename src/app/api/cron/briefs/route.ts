import { cronHandler } from '@/lib/cron'
import { runBriefsJob } from '@/modules/briefs/job'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json, every 15 minutes): sends the personal briefs that are due, in IST. */
export const GET = cronHandler('briefs', (db) => runBriefsJob(db))
