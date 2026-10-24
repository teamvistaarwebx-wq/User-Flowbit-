import { cronHandler } from '@/lib/cron'
import { runFollowUpReminders } from '@/modules/orbit/reminders'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json): Orbit follow-ups due today or overdue. */
export const GET = cronHandler('follow-up-reminders', runFollowUpReminders)
