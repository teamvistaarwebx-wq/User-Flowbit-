import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** Transcribed audio seconds per meeting job, by IST month: what the Meetings AI hours cap counts (lib/meeting-caps). */
const MeetingAiUsageSchema = new Schema(
  {
    ...tenantFields,
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    transcriptId: { type: Schema.Types.ObjectId, ref: 'MeetingTranscript', required: true },
    /** 'YYYY-MM' in IST. */
    month: { type: String, required: true },
    seconds: { type: Number, required: true, min: 0 },
    provider: { type: String, required: true },
  },
  { timestamps: true },
)
MeetingAiUsageSchema.plugin(tenant)
MeetingAiUsageSchema.index({ orgId: 1, month: 1 })
MeetingAiUsageSchema.index({ orgId: 1, transcriptId: 1 }, { unique: true })

export const MeetingAiUsage = defineModel('MeetingAiUsage', MeetingAiUsageSchema)
