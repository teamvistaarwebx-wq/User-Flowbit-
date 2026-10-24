'use server'

import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { deleteStoredFile, registerUploadedFile, saveUpload, storedFileKey } from '@/lib/files'
import { serverEnv } from '@/lib/env'
import { s3ConfigFrom } from '@/lib/storage'
import { directUploadKeys } from '@/lib/storage/keys'
import { presignUrl } from '@/lib/storage/presign'
import { objectId } from '@/lib/validation'
import { Meeting } from '@/models/work/Meeting'
import { MeetingTranscript } from '@/models/work/MeetingTranscript'
import { Org } from '@/models/Org'
import { assertParticipant, loadMeeting } from '../access'
import { cancelNotetaker, processBot, scheduleNotetaker } from './bot'
import { capRefusal, draftMinutes, MAX_RECORDING_SECONDS, refreshTranscription, startTranscription, type MeetingAiCtx } from './pipeline'
import { DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS, MIN_RETENTION_DAYS, retentionDaysOf } from './retention'
import { meetingAllowanceFor } from './usage'

/**
 * Meetings AI actions (feature 'meetings_ai': the add-on or a trial). People
 * in the meeting upload a recording (straight to the bucket when storage is
 * S3/R2), refresh the transcript, redraft the minutes, send or cancel the
 * notetaker, fetch from it, and delete the recording or transcript.
 */

const AI = { product: 'work', feature: 'meetings_ai' } as const
const MAX_RECORDING_BYTES = 200 * 1024 * 1024
const PRESIGN_SECONDS = 15 * 60
const AUDIO_VIDEO = /^(audio|video)\//

const aiCtx = (ctx: Ctx): MeetingAiCtx => ({ orgId: ctx.orgId, userId: ctx.userId, memberId: ctx.memberId, db: ctx.db, entitlements: ctx.entitlements, org: ctx.org })
const refresh = (id: string) => revalidatePath(`/app/work/meetings/${id}`)

const fileFacts = z.object({
  id: objectId,
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().regex(AUDIO_VIDEO, 'Upload an audio or video recording'),
  size: z.number().int().min(1).max(MAX_RECORDING_BYTES, 'Recordings can be up to 200 MB'),
  durationSeconds: z.number().min(1).max(MAX_RECORDING_SECONDS, 'Recordings can be up to 2 hours'),
})

export type UploadPlan = { mode: 'direct'; url: string; fileId: string; key: string } | { mode: 'form' }

/** Checks the cap and, with S3/R2 storage, signs a direct PUT so large files skip the app server. */
export const prepareRecordingUpload = action(
  fileFacts,
  async (input, ctx): Promise<ActionResult<UploadPlan>> => {
    const meeting = await loadMeeting(ctx, input.id)
    assertParticipant(ctx, meeting)
    const allowance = await meetingAllowanceFor(aiCtx(ctx), input.durationSeconds)
    if (!allowance.allowed) return fail(capRefusal(allowance.leftSeconds, input.durationSeconds))
    if (serverEnv().STORAGE_DRIVER !== 's3') return ok(undefined, { mode: 'form' })
    const fileId = new Types.ObjectId()
    const key = storedFileKey(ctx.orgId, fileId, input.name)
    const url = presignUrl(s3ConfigFrom(serverEnv()), { method: 'PUT', key, expiresSeconds: PRESIGN_SECONDS })
    return ok(undefined, { mode: 'direct', url, fileId: String(fileId), key })
  },
  AI,
)

/**
 * After the browser's direct PUT: records the file and starts the transcript.
 * The key is rebuilt here from the file id and name (never taken from the
 * browser), and the stored size is the object's real size.
 */
export const finishRecordingUpload = action(
  // `key` is still accepted from older clients but ignored.
  fileFacts.extend({ fileId: objectId, key: z.string().max(400).optional() }),
  async (input, ctx) => {
    if (serverEnv().STORAGE_DRIVER !== 's3') return fail('Direct uploads are not available here. Upload the recording again.')
    const meeting = await loadMeeting(ctx, input.id)
    assertParticipant(ctx, meeting)
    const file = await registerDirectUpload(ctx, input, meeting._id)
    if (!file) return fail('The upload did not finish. Try again.')
    await startTranscription(aiCtx(ctx), meeting._id, { fileId: file._id, name: file.name, mime: file.mime }, { source: 'upload', seconds: input.durationSeconds })
    await audit(ctx, { action: 'meeting.recording_uploaded', entity: 'Meeting', entityId: meeting._id, product: 'work', summary: `Uploaded a recording of '${meeting.title}' for transcription` })
    refresh(input.id)
    return ok('Recording uploaded. The transcript and minutes follow in a few minutes.')
  },
  AI,
)

/** Tries the keys prepareRecordingUpload could have signed for this file (this month's, then last month's). */
async function registerDirectUpload(ctx: Ctx, input: { fileId: string; name: string; mime: string }, meetingId: Types.ObjectId) {
  const fileId = new Types.ObjectId(input.fileId)
  for (const key of directUploadKeys(ctx.orgId, fileId, input.name)) {
    const file = await registerUploadedFile(ctx, { id: fileId, key, name: input.name, mime: input.mime, kind: 'meeting_recording', maxBytes: MAX_RECORDING_BYTES, entity: 'Meeting', entityId: meetingId })
    if (file) return file
  }
  return null
}

/** Local storage (and small files): the recording travels with the action. */
export const uploadRecording = action(
  z.object({ id: objectId, durationSeconds: z.coerce.number().min(1).max(MAX_RECORDING_SECONDS, 'Recordings can be up to 2 hours'), recording: z.instanceof(File, { error: 'Choose a recording' }) }),
  async (input, ctx) => {
    const meeting = await loadMeeting(ctx, input.id)
    assertParticipant(ctx, meeting)
    if (!AUDIO_VIDEO.test(input.recording.type)) return fail('Upload an audio or video recording.')
    const allowance = await meetingAllowanceFor(aiCtx(ctx), input.durationSeconds)
    if (!allowance.allowed) return fail(capRefusal(allowance.leftSeconds, input.durationSeconds))
    const file = await saveUpload(ctx, input.recording, { kind: 'meeting_recording', entity: 'Meeting', entityId: meeting._id, accept: [input.recording.type] })
    if (!file) return fail('Choose a recording.')
    await startTranscription(aiCtx(ctx), meeting._id, { fileId: file._id, name: file.name, mime: file.mime }, { source: 'upload', seconds: input.durationSeconds })
    await audit(ctx, { action: 'meeting.recording_uploaded', entity: 'Meeting', entityId: meeting._id, product: 'work', summary: `Uploaded a recording of '${meeting.title}' for transcription` })
    refresh(input.id)
    return ok('Recording uploaded. The transcript and minutes follow in a few minutes.')
  },
  AI,
)

export const refreshTranscriptAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    if (!meeting.ai?.transcriptId) return fail('No transcript has been started for this meeting.')
    const state = await refreshTranscription(aiCtx(ctx), meeting.ai.transcriptId)
    refresh(id)
    return state === 'done' ? ok('The transcript is ready and the minutes are in the notes.') : state === 'failed' ? fail('The transcription failed. Upload the recording again.') : ok('Still transcribing. Check again in a minute.')
  },
  AI,
)

export const redraftMinutesAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    if (!meeting.ai?.transcriptId) return fail('There is no transcript yet.')
    const result = await draftMinutes(aiCtx(ctx), meeting._id, meeting.ai.transcriptId)
    refresh(id)
    return ok(result.source === 'ai' ? `Minutes drafted with ${result.items} new action items to confirm.` : 'AI is not available now; the notes quote the transcript.')
  },
  AI,
)

export const nameSpeakerAction = action(
  z.object({ id: objectId, speaker: z.string().max(40), name: z.string().trim().max(80) }),
  async ({ id, speaker, name }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    if (!meeting.ai?.transcriptId) return fail('There is no transcript yet.')
    const key = `speakerNames.${speaker.replace(/[.$]/g, '_')}`
    await ctx.db(MeetingTranscript).updateOne({ _id: meeting.ai.transcriptId }, name ? { $set: { [key]: name } } : { $unset: { [key]: 1 } })
    refresh(id)
    return ok(name ? `Speaker ${speaker} is ${name}.` : 'Name cleared.')
  },
  AI,
)

async function retentionOf(ctx: Ctx): Promise<number> {
  const org = await Org.findById(ctx.orgId, { meetingsAi: 1 }).lean()
  return org ? retentionDaysOf(org) : DEFAULT_RETENTION_DAYS
}

export const sendNotetakerAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    const result = await scheduleNotetaker({ ...aiCtx(ctx), orgName: ctx.org.name, organizerName: ctx.user.name }, id, await retentionOf(ctx))
    await audit(ctx, { action: 'meeting.notetaker_sent', entity: 'Meeting', entityId: meeting._id, product: 'work', summary: `Sent Flowbit Notetaker to '${meeting.title}' (notice to ${result.noticeTo} people)` })
    refresh(id)
    return ok(`Flowbit Notetaker will join '${meeting.title}'. ${result.noticeTo} attendees got the recording notice.`)
  },
  AI,
)

export const cancelNotetakerAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    await cancelNotetaker(aiCtx(ctx), id)
    await audit(ctx, { action: 'meeting.notetaker_cancelled', entity: 'Meeting', entityId: meeting._id, product: 'work', summary: `Called off Flowbit Notetaker for '${meeting.title}'` })
    refresh(id)
    return ok('The notetaker will not join.')
  },
  AI,
)

export const fetchFromBotAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    const state = await processBot(aiCtx(ctx), meeting._id)
    refresh(id)
    const message = { pending: 'The notetaker has not finished yet.', failed: 'The notetaker could not record this meeting.', transcribing: 'Got the recording. The transcript and minutes follow in a few minutes.', done: 'Got the transcript; the minutes are in the notes.', already: 'Already picked up.', busy: 'The recording is being picked up. Check again in a minute.' }[state]
    return state === 'failed' ? fail(message) : ok(message)
  },
  AI,
)

/** Delete the recording, or the transcript (DPDP: anyone in the meeting can). The minutes in the notes stay. */
export const deleteMeetingAiData = action(
  z.object({ id: objectId, what: z.enum(['recording', 'transcript']) }),
  async ({ id, what }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    if (what === 'recording') {
      const transcripts = await ctx.db(MeetingTranscript).find({ meetingId: meeting._id }, { recordingFileId: 1 }).lean()
      const ids = [...new Set([meeting.ai?.recordingFileId, ...transcripts.map((t) => t.recordingFileId)].filter(Boolean).map(String))]
      if (!ids.length) return fail('There is no recording to delete.')
      for (const fileId of ids) await deleteStoredFile(ctx.orgId, fileId)
      await ctx.db(MeetingTranscript).updateMany({ meetingId: meeting._id }, { $unset: { recordingFileId: 1 } })
      await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $unset: { 'ai.recordingFileId': 1, 'ai.recordingName': 1 } })
    } else {
      const removed = await ctx.db(MeetingTranscript).deleteMany({ meetingId: meeting._id })
      if (!removed.deletedCount) return fail('There is no transcript to delete.')
      await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $unset: { 'ai.transcriptId': 1 } })
    }
    await audit(ctx, { action: `meeting.${what}_deleted`, entity: 'Meeting', entityId: meeting._id, product: 'work', summary: `Deleted the ${what} of '${meeting.title}'` })
    refresh(id)
    return ok(what === 'recording' ? 'Recording deleted.' : 'Transcript deleted. The minutes in the notes stay.')
  },
  { product: 'work' },
)

/** Settings → Privacy (org.manage): days recordings and transcripts are kept. */
export const setMeetingRetention = action(
  z.object({ days: z.coerce.number().int().min(MIN_RETENTION_DAYS, `At least ${MIN_RETENTION_DAYS} days`).max(MAX_RETENTION_DAYS) }),
  async ({ days }, ctx) => {
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'meetingsAi.retentionDays': days } })
    await audit(ctx, { action: 'org.meeting_retention_changed', entity: 'Org', entityId: ctx.orgId, summary: `Meeting recordings and transcripts are now kept ${days} days` })
    revalidatePath('/app/settings/privacy')
    return ok(`Recordings and transcripts are deleted ${days} days after the meeting.`)
  },
  { perm: 'org.manage', allowReadOnly: true },
)
