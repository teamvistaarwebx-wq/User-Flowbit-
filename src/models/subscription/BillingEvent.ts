import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * Every payment event received (Razorpay webhooks, simulated payments).
 * Not tenant-scoped: webhooks arrive before the workspace is known.
 * The unique (provider, eventId) index makes webhook retries no-ops.
 */
const BillingEventSchema = new Schema(
  {
    provider: { type: String, enum: ['razorpay', 'simulated'], required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Org' },
    payload: { type: Schema.Types.Mixed },
    receivedAt: { type: Date, default: () => new Date() },
    processedAt: Date,
    error: String,
  },
  { timestamps: false },
)
BillingEventSchema.index({ provider: 1, eventId: 1 }, { unique: true })
BillingEventSchema.index({ orgId: 1, receivedAt: -1 })

export const BillingEvent = defineModel('BillingEvent', BillingEventSchema)
