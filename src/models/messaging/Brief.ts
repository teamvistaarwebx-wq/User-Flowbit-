import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { BRIEF_FREQUENCIES, DEFAULT_BRIEF_DAYS } from '@/modules/briefs/schedule'

/**
 * A personal brief (notifications-v2 §4): one member can keep several
 * ("Morning brief", "End-of-day wrap"). Sections are kept in the order the
 * person chose and re-checked against their permissions on every send.
 */
const BriefSchema = new Schema(
  {
    ...tenantFields,
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    enabled: { type: Boolean, default: true },
    /** 'HH:MM' IST. */
    time: { type: String, default: '08:30' },
    days: { type: [Number], default: () => [...DEFAULT_BRIEF_DAYS] },
    frequency: { type: String, enum: BRIEF_FREQUENCIES, default: 'daily' },
    weekday: { type: Number, min: 0, max: 6, default: 1 },
    channels: { inapp: { type: Boolean, default: true }, email: { type: Boolean, default: true }, whatsapp: { type: Boolean, default: false } },
    sections: { type: [String], default: [] },
    filters: {
      projectIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Project' }], default: [] },
      priorities: { type: [String], default: [] },
      tags: { type: [String], default: [] },
      /** Which of my tasks count: assigned to me, created by me, or watching. */
      scope: { type: String, enum: ['assigned', 'created', 'watching'], default: 'assigned' },
    },
    skipIfEmpty: { type: Boolean, default: true },
    /** The IST date it last went out for (one send per day). */
    lastSentFor: { type: String, default: null },
    lastSentAt: { type: Date },
    lastSkippedFor: { type: String, default: null },
  },
  { timestamps: true },
)
BriefSchema.plugin(tenant)
BriefSchema.index({ orgId: 1, userId: 1 })
BriefSchema.index({ enabled: 1, lastSentFor: 1 })

export const Brief = defineModel('Brief', BriefSchema)
