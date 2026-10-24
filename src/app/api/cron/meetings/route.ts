import { cronHandler } from '@/lib/cron'
import { runMeetingsJob } from '@/modules/work/meetings/ai/job'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json, every 15 minutes): missed transcription callbacks, notetaker pick-ups and the retention purge. */
export const GET = cronHandler('meetings', () => runMeetingsJob())
