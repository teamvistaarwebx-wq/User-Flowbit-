import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { ACTION_CHOICES, ACTION_KINDS } from '@/modules/actionlinks/kinds'

/**
 * A signed one-time action link (approve by email or WhatsApp, task buttons).
 * Only a SHA-256 of the random key is stored. Bound to the member and user it
 * was sent to (and, on WhatsApp, their number). `claimedAt` is held while a
 * decision runs; `usedAt` ends the link. Rows go 30 days after they expire.
 */
const ActionTokenSchema = new Schema(
  {
    ...tenantFields,
    keyHash: { type: String, required: true },
    kind: { type: String, enum: ACTION_KINDS, required: true },
    subjectId: { type: String, required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ['email', 'whatsapp'], required: true },
    /** WhatsApp: the E.164 number it was sent to; a button press from any other number is refused. */
    phone: { type: String },
    choices: { type: [{ type: String, enum: ACTION_CHOICES }], default: [] },
    expiresAt: { type: Date, required: true },
    claimedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    usedChoice: { type: String },
    outcome: { type: String },
  },
  { timestamps: true },
)
ActionTokenSchema.plugin(tenant)
ActionTokenSchema.index({ keyHash: 1 }, { unique: true })
ActionTokenSchema.index({ orgId: 1, kind: 1, subjectId: 1 })
ActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 })

export const ActionToken = defineModel('ActionToken', ActionTokenSchema)
