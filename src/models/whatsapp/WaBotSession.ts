import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A short WhatsApp conversation in progress with one number on a workspace's
 * own number: the employee bot's guided steps (location for check-in, the
 * leave form), a client's UTR after "I've paid", a manager's reason after
 * "Reject". One per number per workspace; gone 15 minutes after the last step.
 */
const WaBotSessionSchema = new Schema(
  {
    ...tenantFields,
    phone: { type: String, required: true },
    flow: { type: String, required: true },
    step: { type: String, default: '' },
    data: { type: Schema.Types.Mixed, default: {} },
    lang: { type: String, enum: ['en', 'hi'], default: 'en' },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)
WaBotSessionSchema.plugin(tenant)
WaBotSessionSchema.index({ orgId: 1, phone: 1 }, { unique: true })
WaBotSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const WaBotSession = defineModel('WaBotSession', WaBotSessionSchema)
