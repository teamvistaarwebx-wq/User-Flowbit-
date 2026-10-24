import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * An outbound webhook (Zapier, Make, n8n or your own server): a URL that
 * passed the SSRF guard, the events it wants, and its signing secret sealed
 * with APP_ENCRYPTION_KEY (lib/secret-box). Only the last four characters
 * are ever shown.
 */
const WebhookEndpointSchema = new Schema(
  {
    ...tenantFields,
    url: { type: String, required: true, maxlength: 2000 },
    description: { type: String, maxlength: 120, default: '' },
    events: { type: [String], default: [] },
    secretSealed: { type: String, required: true },
    secretLast4: { type: String, default: '' },
    active: { type: Boolean, default: true },
    createdByName: { type: String },
    lastDeliveryAt: { type: Date },
    lastStatus: { type: String },
    failingSince: { type: Date, default: null },
  },
  { timestamps: true },
)
WebhookEndpointSchema.plugin(tenant)
WebhookEndpointSchema.index({ orgId: 1, active: 1, events: 1 })

export const WebhookEndpoint = defineModel('WebhookEndpoint', WebhookEndpointSchema)
