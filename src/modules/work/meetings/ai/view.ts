import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { isSarvamConfigured, isRecallConfigured, serverEnv } from '@/lib/env'
import { fileUrl } from '@/lib/files'
import { Meeting } from '@/models/work/Meeting'
import { MeetingTranscript } from '@/models/work/MeetingTranscript'
import { Org } from '@/models/Org'
import { meetingLinkOf } from './bot'
import { retentionDaysOf } from './retention'
import { timestampLabel } from './transcription'
import { meetingAllowanceFor } from './usage'

/** What the meeting page's Meetings AI card shows. */

const SHOWN_SEGMENTS = 400

export type MeetingAiView = {
  configured: { transcription: boolean; bot: boolean; direct: boolean }
  usage: { usedSeconds: number; capSeconds: number }
  retentionDays: number
  recording: { name: string; url: string } | null
  transcript: { status: string; error: string | null; minutesAt: string | null; minutesSource: string | null; segments: { speaker: string; at: string; text: string }[]; speakers: { key: string; name: string }[]; more: number } | null
  notetaker: { status: string; error: string | null; canSend: boolean; canFetch: boolean }
}

export async function meetingAiView(ctx: Ctx, meetingId: string): Promise<MeetingAiView | null> {
  const meeting = await ctx.db(Meeting).findById(meetingId, { ai: 1, notetaker: 1, link: 1, google: 1, endAt: 1, status: 1 }).lean()
  if (!meeting) return null
  const [transcript, allowance, org] = await Promise.all([
    meeting.ai?.transcriptId ? ctx.db(MeetingTranscript).findById(meeting.ai.transcriptId).lean() : null,
    meetingAllowanceFor({ db: ctx.db, entitlements: ctx.entitlements, org: ctx.org }),
    Org.findById(ctx.orgId, { meetingsAi: 1 }).lean(),
  ])
  const names = (transcript?.speakerNames ?? {}) as Record<string, string>
  const keys = [...new Set((transcript?.segments ?? []).map((s) => s.speaker))]
  const future = new Date(meeting.endAt).getTime() > Date.now() && meeting.status !== 'cancelled'
  const nt = meeting.notetaker
  return {
    configured: { transcription: isSarvamConfigured(), bot: isRecallConfigured(), direct: serverEnv().STORAGE_DRIVER === 's3' },
    usage: { usedSeconds: allowance.usedSeconds, capSeconds: allowance.capSeconds },
    retentionDays: org ? retentionDaysOf(org) : 90,
    recording: meeting.ai?.recordingFileId ? { name: meeting.ai.recordingName ?? 'Recording', url: fileUrl(meeting.ai.recordingFileId, { download: true }) } : null,
    transcript: transcript
      ? {
          status: transcript.status,
          error: transcript.error ?? null,
          minutesAt: transcript.minutesAt ? transcript.minutesAt.toISOString() : null,
          minutesSource: meeting.ai?.minutesSource ?? null,
          segments: transcript.segments.slice(0, SHOWN_SEGMENTS).map((s) => ({ speaker: names[s.speaker] || (s.speaker ? `Speaker ${s.speaker}` : 'Speaker'), at: timestampLabel(s.start), text: s.text })),
          speakers: keys.filter(Boolean).map((k) => ({ key: k, name: names[k] ?? '' })),
          more: Math.max(0, transcript.segments.length - SHOWN_SEGMENTS),
        }
      : null,
    notetaker: {
      status: nt?.status ?? 'none',
      error: nt?.error ?? null,
      canSend: future && Boolean(meetingLinkOf(meeting)) && (!nt?.status || nt.status === 'cancelled' || nt.status === 'failed'),
      canFetch: Boolean(nt?.botId) && !nt?.fetchedAt && nt?.status !== 'cancelled',
    },
  }
}
