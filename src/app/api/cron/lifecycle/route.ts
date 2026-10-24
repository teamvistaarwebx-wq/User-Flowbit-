import { cronHandler } from '@/lib/cron'
import { runLifecycleJob } from '@/modules/lifecycle/job'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Vercel Cron (vercel.json, daily 04:30 UTC): trimmed trials back to Free,
 * Day 1/3/7 onboarding emails, and data deletion 90 days after blocking.
 * Deletion is a dry run unless LIFECYCLE_DELETE_ENABLED=true.
 */
export const GET = cronHandler('lifecycle', (db) => runLifecycleJob(db))
