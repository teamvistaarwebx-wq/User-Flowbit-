import { cronHandler } from '@/lib/cron'
import { runHealthJob } from '@/modules/console/health-job'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json, nightly 01:30 IST): Green/Amber/Red per workspace from UsageEvent (console spec 7.3). */
export const GET = cronHandler('health', (db, asOf) => runHealthJob(db, asOf))
