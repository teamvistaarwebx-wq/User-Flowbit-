import { cronHandler } from '@/lib/cron'
import { runTrialReminders } from '@/modules/subscription/reminders'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json): "trial ends in 3 days / tomorrow / has ended" for every workspace on a trial. */
export const GET = cronHandler('trial-reminders', runTrialReminders)
