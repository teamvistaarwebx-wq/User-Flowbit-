import { cronHandler } from '@/lib/cron'
import { runTaskReminders } from '@/modules/work/reminders'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json): due-today and overdue task reminders in Flowbit Work. */
export const GET = cronHandler('task-reminders', runTaskReminders)
