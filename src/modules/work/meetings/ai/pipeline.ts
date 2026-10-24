import 'server-only'
import { Types } from 'mongoose'
import { hashToken, randomToken } from '@/lib/auth/tokens'
import { formatDate } from '@/lib/dates'
import { appUrl, isRecallConfigured, serverEnv } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { readStoredFile } from '@/lib/files'
import { hoursLabel } from '@/lib/meeting-caps'
import { notifyMembers } from '@/lib/notify'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Meeting } from '@/models/work/Meeting'
import { MeetingTranscript } from '@/models/work/MeetingTranscript'
import { askClaudeJson } from '@/modules/work/arc/claude'
import type { AiCtx } from '@/modules/work/arc/usage'
import { MINUTES_SYSTEM, matchOwner, mergeMinutes, minutesPrompt, minutesSchema, templateMinutes, type Minutes } from './minutes'
import { recallProvider, type MeetingBotProvider } from './recall'
import { sarvamProvider } from './sarvam'
import { transcriptText, type Fetch, type JobResult, type TranscriptSegment, type TranscriptionProvider } from './transcription'
import { meetingAllowanceFor, recordMeetingUsage, type UsageCtx } from './usage'

/**
 * Meetings AI pipeline: recording → transcript (Sarvam by default) → minutes
 * (Claude, within the Arc caps) → the meeting's agenda, notes and draft
 * action items. The same steps run for an upload and for the notetaker's
 * recording; callbacks and webhooks re-enter here with a system context.
 */

export type MeetingAiCtx = AiCtx & UsageCtx & { orgId: Types.ObjectId; userId?: Types.ObjectId | null }

/** Sarvam's limit per file. */
export const MAX_RECORDING_SECONDS = 2 * 3600

export function transcriptionProvider(fetchImpl?: Fetch): TranscriptionProvider | null {
  const key = serverEnv().SARVAM_API_KEY
  return key ? sarvamProvider(key, fetchImpl) : null
}

export function botProvider(fetchImpl?: Fetch): MeetingBotProvider | null {
  return isRecallConfigured() ? recallProvider(serverEnv().RECALL_API_KEY, serverEnv().RECALL_REGION, fetchImpl) : null
}

export const capRefusal = (left: number, need: number) =>
  left <= 0 ? 'This workspace has used its Meetings AI hours for the month (or does not have Meetings AI).' : `Only ${hoursLabel(left)} of Meetings AI is left this month and this recording is about ${hoursLabel(need)}.`

type Recording = Readonly<{ fileId: Types.ObjectId; name: string; mime: string }>

/** Sends a stored recording to the provider and records the job on a new transcript. */
export async function startTranscription(ctx: MeetingAiCtx, meetingId: Types.ObjectId, recording: Recording, opts: { source: 'upload' | 'bot'; seconds: number; provider?: TranscriptionProvider | null }) {
  const provider = opts.provider === undefined ? transcriptionProvider() : opts.provider
  if (!provider) throw new UserError('Transcription is not set up on this server (SARVAM_API_KEY).')
  const seconds = Math.min(MAX_RECORDING_SECONDS, Math.max(60, Math.round(opts.seconds)))
  const allowance = await meetingAllowanceFor(ctx, seconds)
  if (!allowance.allowed) throw new UserError(capRefusal(allowance.leftSeconds, seconds))
  const stored = await readStoredFile(ctx.orgId, String(recording.fileId))
  if (!stored) throw new UserError('The recording could not be read. Upload it again.')
  const token = randomToken()
  const transcript = await ctx.db(MeetingTranscript).create({ meetingId, recordingFileId: recording.fileId, source: opts.source, provider: provider.name, status: 'queued', callbackTokenHash: hashToken(token), requestedById: ctx.memberId })
  await ctx.db(Meeting).updateOne({ _id: meetingId }, { $set: { 'ai.recordingFileId': recording.fileId, 'ai.recordingName': recording.name, 'ai.transcriptId': transcript._id }, $unset: { 'ai.purgedAt': 1 } })
  try {
    const { jobId } = await provider.start({ audio: stored.data, fileName: `${transcript._id}${extensionOf(recording.name)}`, mime: recording.mime, callbackUrl: appUrl('/api/webhooks/sarvam'), callbackToken: token })
    await ctx.db(MeetingTranscript).updateOne({ _id: transcript._id }, { $set: { status: 'processing', jobId } })
  } catch (error) {
    console.error('[meetings-ai] transcription did not start', error)
    await ctx.db(MeetingTranscript).updateOne({ _id: transcript._id }, { $set: { status: 'failed', error: (error instanceof Error ? error.message : 'unknown error').slice(0, 300) } })
    throw new UserError('The transcription service did not accept the recording. Try again in a few minutes.')
  }
  return { transcriptId: String(transcript._id) }
}

const extensionOf = (name: string) => (/\.[a-z0-9]{2,5}$/i.exec(name)?.[0] ?? '').toLowerCase()

/** Polls a job; on completion stores the transcript and drafts the minutes. */
export async function refreshTranscription(ctx: MeetingAiCtx, transcriptId: Types.ObjectId | string, provider: TranscriptionProvider | null = transcriptionProvider()): Promise<JobResult['state'] | 'missing'> {
  const transcript = await ctx.db(MeetingTranscript).findById(transcriptId).lean()
  if (!transcript) return 'missing'
  if (transcript.status === 'done') return 'done'
  if (transcript.status === 'failed') return 'failed'
  if (!transcript.jobId || !provider) return 'running'
  const result = await provider.poll(transcript.jobId)
  if (result.state === 'running') return 'running'
  if (result.state === 'failed') {
    await ctx.db(MeetingTranscript).updateOne({ _id: transcript._id, status: { $ne: 'done' } }, { $set: { status: 'failed', error: result.error } })
    return 'failed'
  }
  await finishTranscript(ctx, transcript._id, result)
  return 'done'
}

/** Stores the segments once (a repeated callback does nothing), counts the hours and drafts the minutes. */
export async function finishTranscript(ctx: MeetingAiCtx, transcriptId: Types.ObjectId, data: { segments: TranscriptSegment[]; language: string | null; durationSeconds: number }): Promise<boolean> {
  const updated = await ctx.db(MeetingTranscript).findOneAndUpdate(
    { _id: transcriptId, status: { $ne: 'done' } },
    { $set: { status: 'done', segments: data.segments, language: data.language ?? undefined, durationSeconds: data.durationSeconds, completedAt: new Date() }, $unset: { error: 1 } },
    { returnDocument: 'after' },
  ).lean()
  if (!updated) return false
  await recordMeetingUsage(ctx, { meetingId: updated.meetingId, transcriptId: updated._id, seconds: data.durationSeconds, provider: updated.provider })
  // The transcript is stored either way; minutes that fail here are drafted by the meetings cron (minutesAt stays unset).
  await draftMinutes(ctx, updated.meetingId, updated._id).catch((error: unknown) => console.error('[meetings-ai] minutes not drafted; the cron will retry', String(updated._id), error))
  return true
}

type People = { attendees: { id: string; name: string }[]; members: { id: string; name: string }[] }

async function peopleOf(ctx: MeetingAiCtx, attendeeIds: readonly string[]): Promise<People> {
  const members = await ctx.db(Member).find({ status: 'active' }, { userId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]))
  const all = members.map((m) => ({ id: String(m._id), name: nameOf.get(String(m.userId)) ?? '' })).filter((m) => m.name)
  return { members: all, attendees: all.filter((m) => attendeeIds.includes(m.id)) }
}

/**
 * Claude drafts the minutes from the transcript (Arc caps, redaction and the
 * token log apply); without AI the notes say why and quote the transcript.
 * Writes the agenda (when empty), a Minutes block in the notes and new draft
 * action items, then tells the organiser.
 */
export async function draftMinutes(ctx: MeetingAiCtx, meetingId: Types.ObjectId, transcriptId: Types.ObjectId): Promise<{ source: 'ai' | 'template'; items: number }> {
  const [meeting, transcript] = await Promise.all([ctx.db(Meeting).findById(meetingId).lean(), ctx.db(MeetingTranscript).findById(transcriptId).lean()])
  if (!meeting || !transcript || transcript.status !== 'done') return { source: 'template', items: 0 }
  const attendeeIds = [String(meeting.organizerId), ...meeting.attendees.map((a) => String(a.memberId))]
  const people = await peopleOf(ctx, attendeeIds)
  const text = transcriptText(transcript.segments, (transcript.speakerNames ?? {}) as Record<string, string>)
  const reply = await askClaudeJson(ctx, minutesSchema, {
    task: 'minutes',
    tier: 'draft',
    system: MINUTES_SYSTEM,
    prompt: minutesPrompt({ title: meeting.title, date: formatDate(meeting.startAt), attendees: people.attendees.map((p) => p.name), agenda: meeting.agenda ?? null, transcript: text }),
    maxTokens: 4000,
  })
  const minutes: Minutes = reply.ok ? reply.value : templateMinutes(text, reply.reason === 'cap' ? 'the monthly AI limit is reached' : reply.reason === 'plan' ? 'AI minutes are on paid plans and trials' : reply.reason === 'off' ? 'AI is not set up on this server' : 'the AI reply could not be read')
  const merged = mergeMinutes(meeting, minutes, (owner) => matchOwner(owner, people.attendees, people.members), formatDate(new Date()))
  await ctx.db(Meeting).updateOne(
    { _id: meeting._id },
    {
      $set: { notes: merged.notes, notesUpdatedAt: new Date(), 'ai.minutesAt': new Date(), 'ai.minutesSource': reply.ok ? 'ai' : 'template', ...(merged.agenda ? { agenda: merged.agenda } : {}) },
      $push: { actionItems: { $each: merged.newItems.map((i) => ({ title: i.title, assigneeId: i.assigneeId ? new Types.ObjectId(i.assigneeId) : undefined, dueDate: i.dueDate ?? undefined, done: false })) } },
    },
  )
  await ctx.db(MeetingTranscript).updateOne({ _id: transcript._id }, { $set: { minutesAt: new Date() } })
  await notifyMembers({ orgId: ctx.orgId }, [String(meeting.organizerId)], {
    title: reply.ok ? `Minutes are ready for '${meeting.title}': ${merged.newItems.length} action items to confirm` : `The transcript of '${meeting.title}' is ready`,
    href: `/app/work/meetings/${meeting._id}`,
    kind: 'info',
    product: 'work',
    event: 'meeting.minutes_ready',
  })
  return { source: reply.ok ? 'ai' : 'template', items: merged.newItems.length }
}
