import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const TRANSCRIPT_STATUSES = ['queued', 'processing', 'done', 'failed'] as const
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number]

const SegmentSchema = new Schema({ speaker: { type: String, default: '' }, start: { type: Number, default: 0 }, end: { type: Number, default: 0 }, text: { type: String, default: '' } }, { _id: false })

/**
 * A meeting's recording transcript (Meetings AI, modules/work/meetings/ai):
 * the provider job, then speaker-labelled segments with timestamps (seconds).
 * Purged with the recording after the workspace's retention (default 90 days).
 */
const MeetingTranscriptSchema = new Schema(
  {
    ...tenantFields,
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    recordingFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    /** 'upload' or 'bot' (the notetaker's recording). */
    source: { type: String, enum: ['upload', 'bot'], default: 'upload' },
    provider: { type: String, required: true },
    jobId: { type: String },
    status: { type: String, enum: TRANSCRIPT_STATUSES, default: 'queued' },
    error: { type: String, maxlength: 500 },
    language: { type: String },
    durationSeconds: { type: Number, default: 0 },
    /** Speaker label → member name, set by people on the meeting page. */
    speakerNames: { type: Schema.Types.Mixed, default: undefined },
    segments: { type: [SegmentSchema], default: [] },
    /** HMAC the provider's callback must present (stored hashed). */
    callbackTokenHash: { type: String },
    requestedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    completedAt: { type: Date },
    /** When the minutes were drafted from this transcript; the meetings cron drafts any done transcript still without them. */
    minutesAt: { type: Date },
    /** Sweep tries at drafting the minutes (the cron stops after a few). */
    minutesAttempts: { type: Number },
  },
  { timestamps: true },
)
MeetingTranscriptSchema.plugin(tenant)
MeetingTranscriptSchema.index({ orgId: 1, meetingId: 1, createdAt: -1 })
MeetingTranscriptSchema.index({ orgId: 1, createdAt: 1 })
MeetingTranscriptSchema.index({ jobId: 1 }, { sparse: true })

export const MeetingTranscript = defineModel('MeetingTranscript', MeetingTranscriptSchema)
