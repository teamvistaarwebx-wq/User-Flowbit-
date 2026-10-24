import { cronHandler } from '@/lib/cron'
import { checkGmailReplies } from '@/modules/orbit/sequences/replies'
import { runSequences } from '@/modules/orbit/sequences/runner'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Vercel Cron (vercel.json, every 15 minutes): Gmail reply detection first (when
 * GMAIL_REPLY_DETECTION is on), so a lead who replied gets no next step, then
 * the next step of every due Orbit sequence enrolment.
 */
export const GET = cronHandler('sequences', async (db) => {
  const replies = await checkGmailReplies(db)
  return { replies, steps: await runSequences(db) }
})
