import { readBodyLimited } from '@/lib/read-body'
import { after, NextResponse, type NextRequest } from 'next/server'
import { isValidObjectId } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { Meeting } from '@/models/work/Meeting'
import { processBot, systemAiCtx } from '@/modules/work/meetings/ai/bot'
import { readRecallWebhook, RECALL_DONE_EVENTS, RECALL_FAILED_EVENTS } from '@/modules/work/meetings/ai/recall'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Recall.ai status webhooks (Svix-signed with RECALL_WEBHOOK_SECRET). The bot
 * carries the workspace and meeting in its metadata; both must match the
 * stored bot id. When it is done, the recording or transcript is picked up
 * after the 200 and continues the upload pipeline.
 */
/** Recall's status events are small JSON; anything larger is refused while streaming. */
const MAX_RECALL_BYTES = 256 * 1024

export async function POST(request: NextRequest) {
  const secret = serverEnv().RECALL_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'The notetaker is not set up.' }, { status: 503 })
  const raw = await readBodyLimited(request, MAX_RECALL_BYTES)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const event = readRecallWebhook(raw, (name) => request.headers.get(name), secret)
  if (!event) return NextResponse.json({ error: 'Bad signature.' }, { status: 401 })
  if (!event.botId || !event.orgId || !event.meetingId || !isValidObjectId(event.orgId) || !isValidObjectId(event.meetingId)) return NextResponse.json({ ok: true, ignored: true })
  await dbConnect()
  const meeting = await Meeting.findOne({ _id: event.meetingId, orgId: event.orgId, 'notetaker.botId': event.botId }, { organizerId: 1, orgId: 1 }).lean()
  if (!meeting) return NextResponse.json({ ok: true, ignored: true })
  if (RECALL_FAILED_EVENTS.includes(event.event)) {
    await Meeting.updateOne({ _id: meeting._id }, { $set: { 'notetaker.status': 'failed', 'notetaker.error': 'The notetaker could not join or record the meeting.' } })
  } else if (event.event === 'bot.in_call_recording') {
    await Meeting.updateOne({ _id: meeting._id, 'notetaker.status': 'scheduled' }, { $set: { 'notetaker.status': 'joined' } })
  } else if (RECALL_DONE_EVENTS.includes(event.event)) {
    after(async () => {
      try {
        const ctx = await systemAiCtx(meeting.orgId, meeting.organizerId)
        if (ctx) await processBot(ctx, meeting._id)
      } catch (error) {
        console.error('[meetings-ai] bot pick-up failed', event.botId, error)
      }
    })
  }
  return NextResponse.json({ ok: true })
}
