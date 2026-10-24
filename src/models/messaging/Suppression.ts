import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { CONSENT_SOURCES, SUPPRESSION_SCOPES } from '@/modules/messaging/consent'
import { CHANNELS } from '@/modules/messaging/events'

/**
 * The suppression list (notifications-v2 §0b.9): one address on one channel
 * in one workspace that every send honours. 'non_essential' (unsubscribe,
 * complaint, bounce) still lets essential mail through; 'all' (WhatsApp STOP)
 * stops the channel. Removing the row (an opt-in) restores sending.
 */
const SuppressionSchema = new Schema(
  {
    ...tenantFields,
    channel: { type: String, enum: CHANNELS, required: true },
    /** Lower-case email or an E.164 number. */
    address: { type: String, required: true },
    scope: { type: String, enum: SUPPRESSION_SCOPES, default: 'non_essential' },
    source: { type: String, enum: CONSENT_SOURCES, required: true },
    /** Bounce or complaint detail from the provider. */
    note: { type: String },
    contactId: { type: Schema.Types.ObjectId },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
SuppressionSchema.plugin(tenant)
SuppressionSchema.index({ orgId: 1, channel: 1, address: 1 }, { unique: true })

export const Suppression = defineModel('Suppression', SuppressionSchema)
