import 'server-only'
import { scoped } from '@/lib/db/scoped'
import { deleteStoredFile } from '@/lib/files'
import { serverEnv } from '@/lib/env'
import { Org } from '@/models/Org'
import { Meeting } from '@/models/work/Meeting'
import { MeetingTranscript } from '@/models/work/MeetingTranscript'
import { isPurgeLive, purgeCutoff, retentionDaysOf, type PurgeReport } from './retention'

/** The purge stops starting new meetings after this, so the cron run ends well inside maxDuration. */
export const PURGE_TIME_BUDGET_MS = 120_000
const DUE_BATCH = 500

/** Workspaces with anything to purge: a transcript, or a recording whose transcript was deleted (R3 M10). */
async function orgsWithMeetingAiData() {
  const [withTranscripts, withRecordings] = await Promise.all([
    MeetingTranscript.distinct('orgId'),
    Meeting.distinct('orgId', { 'ai.recordingFileId': { $ne: null } }),
  ])
  return [...new Map([...withTranscripts, ...withRecordings].map((id) => [String(id), id])).values()]
}

/**
 * The daily Meetings AI retention job: recordings and transcripts of meetings
 * that ended more than the workspace's retention ago. Dry run (counts only)
 * unless MEETINGS_PURGE is on. The meeting's notes and action items stay.
 */
export async function purgeMeetingRecordings(now: Date = new Date(), live: boolean = isPurgeLive(serverEnv().MEETINGS_PURGE), clock: () => number = Date.now): Promise<PurgeReport> {
  const deadline = clock() + PURGE_TIME_BUDGET_MS
  const orgIds = await orgsWithMeetingAiData()
  let workspaces = 0
  let meetings = 0
  let recordings = 0
  let transcripts = 0
  for (const orgId of orgIds) {
    if (clock() > deadline) break
    const org = await Org.findById(orgId, { meetingsAi: 1, deletedAt: 1 }).lean()
    if (!org || org.deletedAt) continue
    const cutoff = purgeCutoff(retentionDaysOf(org), now)
    const db = <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, org._id)
    const due = await db(Meeting).find({ endAt: { $lt: cutoff }, 'ai.purgedAt': null, $or: [{ 'ai.transcriptId': { $ne: null } }, { 'ai.recordingFileId': { $ne: null } }] }, { ai: 1 }).limit(DUE_BATCH).lean()
    if (!due.length) continue
    workspaces += 1
    for (const meeting of due) {
      if (clock() > deadline) break
      const rows = await db(MeetingTranscript).find({ meetingId: meeting._id }, { recordingFileId: 1 }).lean()
      const fileIds = [...new Set([...rows.map((r) => r.recordingFileId), meeting.ai?.recordingFileId].filter(Boolean).map(String))]
      meetings += 1
      recordings += fileIds.length
      transcripts += rows.length
      if (!live) continue
      for (const id of fileIds) await deleteStoredFile(org._id, id)
      await db(MeetingTranscript).deleteMany({ meetingId: meeting._id })
      await db(Meeting).updateOne({ _id: meeting._id }, { $set: { 'ai.purgedAt': now }, $unset: { 'ai.recordingFileId': 1, 'ai.transcriptId': 1, 'ai.recordingName': 1 } })
    }
  }
  const report = { dryRun: !live, workspaces, meetings, recordings, transcripts }
  console.info('[meetings-ai] retention', JSON.stringify(report))
  return report
}
