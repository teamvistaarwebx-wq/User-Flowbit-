import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const RSVP_STATUSES = ['pending', 'accepted', 'tentative', 'declined'] as const
export type Rsvp = (typeof RSVP_STATUSES)[number]
export const MEETING_STATUSES = ['scheduled', 'cancelled'] as const

const AttendeeSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    rsvp: { type: String, enum: RSVP_STATUSES, default: 'pending' },
    respondedAt: { type: Date },
  },
  { _id: false },
)

const ActionItemSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  assigneeId: { type: Schema.Types.ObjectId, ref: 'Member' },
  dueDate: { type: String },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
  done: { type: Boolean, default: false },
})

const MeetingSchema = new Schema(
  {
    ...tenantFields,
    title: { type: String, required: true, trim: true, maxlength: 150 },
    agenda: { type: String, maxlength: 5000 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    organizerId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    location: { type: String, maxlength: 200 },
    link: { type: String, maxlength: 500 },
    attendees: { type: [AttendeeSchema], default: [] },
    status: { type: String, enum: MEETING_STATUSES, default: 'scheduled' },
    cancelledAt: { type: Date },
    cancelledById: { type: Schema.Types.ObjectId, ref: 'Member' },
    notes: { type: String, maxlength: 20000 },
    notesUpdatedAt: { type: Date },
    notesUpdatedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    actionItems: { type: [ActionItemSchema], default: [] },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    /** Meetings AI (modules/work/meetings/ai): the latest recording and transcript, and when the minutes were drafted. */
    ai: {
      recordingFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
      recordingName: { type: String },
      transcriptId: { type: Schema.Types.ObjectId, ref: 'MeetingTranscript' },
      minutesAt: { type: Date },
      /** 'ai' (Claude) or 'template' (no AI: the transcript only). */
      minutesSource: { type: String },
      purgedAt: { type: Date },
    },
    /** The Recall.ai notetaker ("Flowbit Notetaker"): scheduled for the meeting link, with the consent notice sent. */
    notetaker: {
      provider: { type: String },
      botId: { type: String },
      /** 'booking': a send is in progress (claimed atomically so a double click books one bot). */
      status: { type: String, enum: ['booking', 'scheduled', 'joined', 'done', 'failed', 'cancelled'] },
      scheduledAt: { type: Date },
      noticeSentAt: { type: Date },
      fetchedAt: { type: Date },
      /** A booking or pick-up in progress holds this claim until then; an expired claim may be taken again. */
      claimUntil: { type: Date },
      /** Pick-up tries that failed for a passing reason (download error); the cron gives up after a few. */
      pickupAttempts: { type: Number },
      error: { type: String, maxlength: 300 },
    },
    /** Google Calendar copy (modules/work/meetings/google-sync): the event on this member's primary calendar. */
    google: {
      eventId: { type: String },
      memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
      meetLink: { type: String, maxlength: 500 },
      syncedAt: { type: Date },
      error: { type: String, maxlength: 300 },
    },
  },
  { timestamps: true },
)
MeetingSchema.plugin(tenant)
MeetingSchema.index({ orgId: 1, startAt: 1 })
MeetingSchema.index({ orgId: 1, 'attendees.memberId': 1, startAt: 1 })
MeetingSchema.index({ orgId: 1, organizerId: 1 })
MeetingSchema.index({ 'notetaker.botId': 1 }, { sparse: true })

export const Meeting = defineModel('Meeting', MeetingSchema)
