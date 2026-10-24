import 'server-only'
import { Types } from 'mongoose'
import { scoped } from '@/lib/db/scoped'
import { formatDateTime } from '@/lib/dates'
import { entitlements } from '@/lib/entitlements'
import { UserError } from '@/lib/errors'
import { deleteStoredFile, saveFile } from '@/lib/files'
import { BodyTooLargeError, fetchWithTimeout, MEDIA_TIMEOUT_MS, readBodyCapped } from '@/lib/fetch-timeout'
import { emailLayout, sendMail } from '@/lib/mail'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { Meeting } from '@/models/work/Meeting'
import { MeetingTranscript } from '@/models/work/MeetingTranscript'
import { botProvider, finishTranscript, startTranscription, type MeetingAiCtx } from './pipeline'
import { BOT_NAME, type MeetingBotProvider } from './recall'
import { durationOf, type Fetch } from './transcription'
import { meetingAllowanceFor } from './usage'

/**
 * The notetaker: schedule "Flowbit Notetaker" on the meeting link (after a
 * consent notice to the attendees), and pick up its recording or transcript
 * when Recall says it is done (webhook) or someone presses "Fetch from bot".
 */

const MAX_BOT_AUDIO_BYTES = 200 * 1024 * 1024

type MeetingDoc = NonNullable<Awaited<ReturnType<typeof loadMeetingDoc>>>
const loadMeetingDoc = (ctx: Pick<MeetingAiCtx, 'db'>, id: Types.ObjectId | string) => ctx.db(Meeting).findById(id).lean()

export const meetingLinkOf = (m: { link?: string | null; google?: { meetLink?: string | null } | null }): string | null => {
  const link = m.google?.meetLink || m.link || ''
  return /^https:\/\/(meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\//i.test(link) ? link : null
}

/** A context for webhooks and cron (no signed-in member): the workspace, its entitlements and a member to act as. */
export async function systemAiCtx(orgId: Types.ObjectId | string, memberId: Types.ObjectId | string): Promise<MeetingAiCtx | null> {
  const org = await Org.findById(orgId).lean()
  if (!org || org.deletedAt) return null
  return { orgId: org._id, org, entitlements: entitlements(org), memberId: new Types.ObjectId(String(memberId)), db: (model) => scoped(model, org._id) }
}

async function attendeeEmails(ctx: MeetingAiCtx, meeting: MeetingDoc): Promise<string[]> {
  const ids = [meeting.organizerId, ...meeting.attendees.map((a) => a.memberId)]
  const members = await ctx.db(Member).find({ _id: { $in: ids }, status: 'active' }, { userId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { email: 1 }).lean()
  return [...new Set(users.map((u) => u.email).filter(Boolean))]
}

/** A send holds the booking claim this long; a crashed send frees the meeting after it. */
const BOOKING_CLAIM_MS = 2 * 60_000
/** A pick-up (download, store, start transcription) holds its claim this long. */
const PICKUP_CLAIM_MS = 10 * 60_000
/** Pick-ups that fail for a passing reason are retried by the cron this many times. */
export const MAX_PICKUP_ATTEMPTS = 5
const MAX_MEETING_SECONDS = 2 * 3600

/** Meetings a new booking may claim: no notetaker, a cancelled or failed one, or a booking whose claim expired. */
export const bookingClaimFilter = (meetingId: Types.ObjectId | string, now: Date) => ({
  _id: meetingId,
  $or: [{ 'notetaker.status': { $in: [null, 'cancelled', 'failed'] } }, { 'notetaker.status': 'booking', 'notetaker.claimUntil': { $lt: now } }],
})

/** Meetings whose recording no one has picked up and no one is picking up right now. */
export const pickupClaimFilter = (meetingId: Types.ObjectId | string, now: Date) => ({
  _id: meetingId,
  'notetaker.fetchedAt': null,
  $or: [{ 'notetaker.claimUntil': null }, { 'notetaker.claimUntil': { $lt: now } }],
})

type ConsentCtx = MeetingAiCtx & { orgName: string; organizerName: string }

async function sendConsentNotice(ctx: ConsentCtx, meeting: MeetingDoc, retentionDays: number): Promise<number> {
  const to = await attendeeEmails(ctx, meeting)
  if (!to.length) return 0
  const mail = emailLayout({
    title: `${BOT_NAME} will record '${meeting.title}'`,
    workspace: ctx.orgName,
    paragraphs: [
      `${ctx.organizerName} added ${BOT_NAME} to '${meeting.title}' on ${formatDateTime(meeting.startAt)}. It joins the call, says so in the chat, and records the audio to write the minutes.`,
      `The recording and transcript are kept for ${retentionDays} days and then deleted. Anyone in the meeting can ask the organiser to remove the notetaker or delete the recording.`,
    ],
    cta: { label: 'Open the meeting', href: `/app/work/meetings/${meeting._id}` },
  })
  await sendMail({ orgId: ctx.orgId, to, subject: `Notice: '${meeting.title}' will be recorded`, ...mail, kind: 'meeting', entity: 'Meeting', entityId: meeting._id })
  return to.length
}

/**
 * Schedules the bot and emails the consent notice (DPDP): who records, why,
 * how long it is kept, how to object. The meeting is claimed ('booking')
 * before the bot is booked, so two sends book one bot; when a later step
 * fails the bot is cancelled and the claim released.
 */
export async function scheduleNotetaker(ctx: ConsentCtx, meetingId: string, retentionDays: number, provider: MeetingBotProvider | null = botProvider()) {
  if (!provider) throw new UserError('The notetaker is not set up on this server (RECALL_API_KEY and RECALL_WEBHOOK_SECRET).')
  const meeting = await loadMeetingDoc(ctx, meetingId)
  if (!meeting) throw new UserError('That meeting is not in this workspace.')
  if (meeting.status === 'cancelled') throw new UserError('This meeting is cancelled.')
  if (new Date(meeting.endAt).getTime() < Date.now()) throw new UserError('This meeting has already ended. Upload its recording instead.')
  const link = meetingLinkOf(meeting)
  if (!link) throw new UserError('Add a Google Meet, Zoom or Teams link to the meeting first.')
  const seconds = Math.max(60, Math.round((new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime()) / 1000))
  const allowance = await meetingAllowanceFor(ctx, Math.min(seconds, MAX_MEETING_SECONDS))
  if (!allowance.allowed) throw new UserError('This workspace has no Meetings AI hours left this month.')
  const now = new Date()
  const claimed = await ctx.db(Meeting).updateOne(bookingClaimFilter(meeting._id, now), { $set: { notetaker: { status: 'booking', claimUntil: new Date(now.getTime() + BOOKING_CLAIM_MS) } } })
  if (!claimed.modifiedCount) throw new UserError('The notetaker is already booked for this meeting.')
  let botId: string | null = null
  try {
    botId = (await provider.schedule({ meetingUrl: link, joinAt: new Date(meeting.startAt), metadata: { orgId: String(ctx.orgId), meetingId: String(meeting._id) } })).botId
    const noticeTo = await sendConsentNotice(ctx, meeting, retentionDays)
    await ctx.db(Meeting).updateOne({ _id: meeting._id, 'notetaker.status': 'booking' }, { $set: { notetaker: { provider: provider.name, botId, status: 'scheduled', scheduledAt: new Date(), noticeSentAt: noticeTo ? new Date() : undefined } } })
    return { botId, noticeTo }
  } catch (error) {
    const booked = botId
    if (booked) await provider.cancel(booked).catch((cancelError: unknown) => console.error('[meetings-ai] could not cancel a half-booked bot', booked, cancelError))
    await ctx.db(Meeting).updateOne({ _id: meeting._id, 'notetaker.status': 'booking' }, { $unset: { notetaker: 1 } })
    throw error
  }
}

export async function cancelNotetaker(ctx: MeetingAiCtx, meetingId: string, provider: MeetingBotProvider | null = botProvider()) {
  const meeting = await loadMeetingDoc(ctx, meetingId)
  if (!meeting?.notetaker?.botId || meeting.notetaker.status !== 'scheduled') throw new UserError('No notetaker is booked for this meeting.')
  if (provider) await provider.cancel(meeting.notetaker.botId).catch((error: unknown) => console.error('[meetings-ai] bot cancel failed', error))
  await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $set: { 'notetaker.status': 'cancelled' } })
}

type PickupState = 'pending' | 'failed' | 'transcribing' | 'done' | 'already' | 'busy'
type BotArtifacts = Awaited<ReturnType<MeetingBotProvider['artifacts']>>

const markPickedUp = (ctx: MeetingAiCtx, meetingId: Types.ObjectId, status: 'done' | 'failed', error?: string) =>
  ctx.db(Meeting).updateOne({ _id: meetingId }, { $set: { 'notetaker.fetchedAt': new Date(), 'notetaker.status': status, ...(error ? { 'notetaker.error': error } : {}) }, $unset: { 'notetaker.claimUntil': 1 } })

/** Frees the pick-up claim after a passing failure so the cron tries again; gives up after MAX_PICKUP_ATTEMPTS. */
async function releasePickup(ctx: MeetingAiCtx, meetingId: Types.ObjectId): Promise<void> {
  const error = 'The recording could not be picked up yet. Flowbit will try again.'
  await ctx.db(Meeting).updateOne({ _id: meetingId }, { $unset: { 'notetaker.claimUntil': 1 }, $inc: { 'notetaker.pickupAttempts': 1 }, $set: { 'notetaker.error': error } })
  await ctx.db(Meeting).updateOne({ _id: meetingId, 'notetaker.fetchedAt': null, 'notetaker.pickupAttempts': { $gte: MAX_PICKUP_ATTEMPTS } }, { $set: { 'notetaker.fetchedAt': new Date(), 'notetaker.status': 'failed', 'notetaker.error': 'The recording could not be picked up from the notetaker.' } })
}

/**
 * Picks up what the bot recorded: its transcript when Recall made one, else
 * the mixed audio, stored as the meeting's recording and transcribed as an
 * upload. A short claim keeps a webhook and a click from both doing it; the
 * pick-up is marked done only once the transcript exists or its job started,
 * and the claim is released when anything in between fails.
 */
export async function processBot(ctx: MeetingAiCtx, meetingId: Types.ObjectId | string, provider: MeetingBotProvider | null = botProvider(), fetchImpl: Fetch = fetch): Promise<PickupState> {
  if (!provider) throw new UserError('The notetaker is not set up on this server.')
  const meeting = await loadMeetingDoc(ctx, meetingId)
  if (!meeting?.notetaker?.botId) throw new UserError('No notetaker was sent to this meeting.')
  if (meeting.notetaker.fetchedAt) return 'already'
  const found = await provider.artifacts(meeting.notetaker.botId)
  if (found.status === 'pending') return 'pending'
  if (found.status === 'failed') {
    const marked = await ctx.db(Meeting).updateOne({ _id: meeting._id, 'notetaker.fetchedAt': null }, { $set: { 'notetaker.fetchedAt': new Date(), 'notetaker.status': 'failed', ...(found.error ? { 'notetaker.error': found.error } : {}) } })
    return marked.modifiedCount ? 'failed' : 'already'
  }
  const now = new Date()
  const claimed = await ctx.db(Meeting).updateOne(pickupClaimFilter(meeting._id, now), { $set: { 'notetaker.claimUntil': new Date(now.getTime() + PICKUP_CLAIM_MS) } })
  if (!claimed.modifiedCount) return 'busy'
  try {
    return await pickUp(ctx, meeting, found, provider.name, fetchImpl)
  } catch (error) {
    await releasePickup(ctx, meeting._id)
    throw error
  }
}

async function pickUp(ctx: MeetingAiCtx, meeting: MeetingDoc, found: BotArtifacts, providerName: string, fetchImpl: Fetch): Promise<PickupState> {
  if (found.transcript) {
    const transcript = await ctx.db(MeetingTranscript).create({ meetingId: meeting._id, source: 'bot', provider: providerName, status: 'processing', requestedById: ctx.memberId })
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $set: { 'ai.transcriptId': transcript._id } })
    await finishTranscript(ctx, transcript._id, { segments: found.transcript, language: null, durationSeconds: durationOf(found.transcript) })
    await markPickedUp(ctx, meeting._id, 'done')
    return 'done'
  }
  if (!found.audioUrl) {
    await markPickedUp(ctx, meeting._id, 'failed', 'The notetaker finished without a recording.')
    return 'failed'
  }
  const bytes = await downloadBotAudio(found.audioUrl, fetchImpl)
  if (bytes === 'too_large') {
    await markPickedUp(ctx, meeting._id, 'failed', 'The recording is too large.')
    return 'failed'
  }
  const file = await saveFile({ orgId: ctx.orgId, userId: ctx.userId ?? undefined } as never, { name: `${meeting.title.slice(0, 60)} (notetaker).mp3`, mime: 'audio/mpeg', data: bytes, kind: 'meeting_recording', entity: 'Meeting', entityId: meeting._id, maxBytes: MAX_BOT_AUDIO_BYTES })
  const seconds = Math.round((new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime()) / 1000)
  try {
    await startTranscription(ctx, meeting._id, { fileId: file._id, name: file.name, mime: file.mime }, { source: 'bot', seconds })
  } catch (error) {
    await deleteStoredFile(ctx.orgId, String(file._id))
    throw error
  }
  await markPickedUp(ctx, meeting._id, 'done')
  return 'transcribing'
}

/** The bot's audio, with a timeout and a size cap checked before (Content-Length) and while reading. Throws on a passing failure. */
async function downloadBotAudio(url: string, fetchImpl: Fetch): Promise<Buffer | 'too_large'> {
  const res = await fetchWithTimeout(url, { method: 'GET' }, MEDIA_TIMEOUT_MS, fetchImpl)
  if (!res.ok) throw new Error(`Notetaker audio download answered ${res.status}`)
  try {
    return await readBodyCapped(res, MAX_BOT_AUDIO_BYTES)
  } catch (error) {
    if (error instanceof BodyTooLargeError) return 'too_large'
    throw error
  }
}
