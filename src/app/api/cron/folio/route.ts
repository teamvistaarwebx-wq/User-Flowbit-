import { cronHandler } from '@/lib/cron'
import { runFolioDaily } from '@/modules/folio/collections/daily'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json): Folio overdue reminders and retainer drafts for every workspace. */
export const GET = cronHandler('folio', runFolioDaily)
