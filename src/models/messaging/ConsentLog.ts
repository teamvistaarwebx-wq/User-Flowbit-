import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { CONSENT_SOURCES } from '@/modules/messaging/consent'
import { CHANNELS } from '@/modules/messaging/events'

/**
 * Consent log per contact and channel (DPDP, notifications-v2 §0b.9): every
 * opt-in and opt-out with its time, source and the notice version shown.
 * Append-only; the current state is the Suppression list.
 */
const ConsentLogSchema = new Schema(
  {
    ...tenantFields,
    channel: { type: String, enum: CHANNELS, required: true },
    address: { type: String, required: true },
    action: { type: String, enum: ['opt_in', 'opt_out'], required: true },
    source: { type: String, enum: CONSENT_SOURCES, required: true },
    noticeVersion: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
    contactId: { type: Schema.Types.ObjectId },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    /** Who recorded it when not the person themselves (an admin). */
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
  },
  { timestamps: true },
)
ConsentLogSchema.plugin(tenant)
ConsentLogSchema.index({ orgId: 1, channel: 1, address: 1, at: -1 })

export const ConsentLog = defineModel('ConsentLog', ConsentLogSchema)
