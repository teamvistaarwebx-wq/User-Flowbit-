import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** One signed delivery of one event to one endpoint, with retries (the delivery log). Kept 30 days. */
const WebhookDeliverySchema = new Schema(
  {
    ...tenantFields,
    endpointId: { type: Schema.Types.ObjectId, ref: 'WebhookEndpoint', required: true },
    deliveryId: { type: String, required: true },
    event: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['queued', 'sending', 'delivered', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: () => new Date() },
    lastStatusCode: { type: Number },
    lastError: { type: String, maxlength: 300 },
    deliveredAt: { type: Date },
    test: { type: Boolean, default: false },
  },
  { timestamps: true },
)
WebhookDeliverySchema.plugin(tenant)
WebhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 })
WebhookDeliverySchema.index({ orgId: 1, endpointId: 1, createdAt: -1 })
WebhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86_400 })

export const WebhookDelivery = defineModel('WebhookDelivery', WebhookDeliverySchema)
