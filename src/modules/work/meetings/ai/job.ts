import 'server-only'
import { Meeting } from '@/models/work/Meeting'
import { MeetingTranscript } from '@/models/work/MeetingTranscript'
import { processBot, systemAiCtx } from './bot'
import { botProvider, draftMinutes, refreshTranscription, transcriptionProvider } from './pipeline'
import { purgeMeetingRecordings } from './purge'

/**
 * /api/cron/meetings (every 15 minutes): catches transcripts whose callback
 * never came, notetakers whose webhook was missed, and runs the retention
 * purge (dry run unless MEETINGS_PURGE). Each step is bounded and logs its own failures.
 */

const STUCK_AFTER_MS = 5 * 60_000
const BOT_GRACE_MS = 20 * 60_000
const BATCH = 20
/** A transcript finished this long ago without minutes is drafted by the sweep (the live path gets the first go). */
const MINUTES_GRACE_MS = 10 * 60_000
/** Older transcripts are left alone; nobody waits for minutes of a meeting a week gone. */
const MINUTES_SWEEP_WINDOW_MS = 7 * 86_400_000
export const MAX_MINUTES_ATTEMPTS = 3

/** Done transcripts whose minutes were never drafted (L-27d): one more try each run, a few tries in all. */
export async function sweepMissingMinutes(now: Date): Promise<number> {
  const missing = await MeetingTranscript.find({
    status: 'done',
    minutesAt: null,
    requestedById: { $ne: null },
    completedAt: { $lt: new Date(now.getTime() - MINUTES_GRACE_MS), $gt: new Date(now.getTime() - MINUTES_SWEEP_WINDOW_MS) },
    $or: [{ minutesAttempts: null }, { minutesAttempts: { $lt: MAX_MINUTES_ATTEMPTS } }],
  }, { orgId: 1, meetingId: 1, requestedById: 1 }).limit(BATCH).lean()
  let drafted = 0
  for (const t of missing) {
    try {
      await MeetingTranscript.updateOne({ _id: t._id }, { $inc: { minutesAttempts: 1 } })
      const ctx = t.requestedById ? await systemAiCtx(t.orgId, t.requestedById) : null
      if (!ctx) continue
      await draftMinutes(ctx, t.meetingId, t._id)
      drafted += 1
    } catch (error) {
      console.error('[meetings-ai] minutes sweep failed', String(t._id), error)
    }
  }
  return drafted
}

export async function runMeetingsJob(now: Date = new Date()) {
  let polled = 0
  let bots = 0
  const provider = transcriptionProvider()
  if (provider) {
    const stuck = await MeetingTranscript.find({ status: 'processing', jobId: { $ne: null }, updatedAt: { $lt: new Date(now.getTime() - STUCK_AFTER_MS) } }, { orgId: 1, requestedById: 1 }).limit(BATCH).lean()
    for (const t of stuck) {
      try {
        const ctx = t.requestedById ? await systemAiCtx(t.orgId, t.requestedById) : null
        if (ctx) await refreshTranscription(ctx, t._id, provider)
        await MeetingTranscript.updateOne({ _id: t._id, status: 'processing' }, { $set: { updatedAt: now } })
        polled += 1
      } catch (error) {
        console.error('[meetings-ai] poll failed', String(t._id), error)
      }
    }
  }
  const bot = botProvider()
  if (bot) {
    // A pick-up in progress holds claimUntil; one that failed released it, so the cron tries again.
    const ended = await Meeting.find({ 'notetaker.status': { $in: ['scheduled', 'joined'] }, 'notetaker.fetchedAt': null, $or: [{ 'notetaker.claimUntil': null }, { 'notetaker.claimUntil': { $lt: now } }], endAt: { $lt: new Date(now.getTime() - BOT_GRACE_MS) } }, { orgId: 1, organizerId: 1 }).limit(BATCH).lean()
    for (const m of ended) {
      try {
        const ctx = await systemAiCtx(m.orgId, m.organizerId)
        if (ctx) await processBot(ctx, m._id, bot)
        bots += 1
      } catch (error) {
        console.error('[meetings-ai] bot pick-up failed', String(m._id), error)
      }
    }
  }
  const minutes = await sweepMissingMinutes(now)
  const retention = await purgeMeetingRecordings(now)
  return { polled, bots, minutes, retention }
}
