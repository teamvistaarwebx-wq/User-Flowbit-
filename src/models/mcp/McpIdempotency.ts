import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** "This source already made this record": the same Slack message or email sent twice creates nothing new. */
const McpIdempotencySchema = new Schema(
  {
    ...tenantFields,
    key: { type: String, required: true },
    model: { type: String, required: true },
    recordId: { type: Schema.Types.ObjectId, required: true },
    label: { type: String },
    batchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch' },
  },
  { timestamps: true },
)
McpIdempotencySchema.plugin(tenant)
McpIdempotencySchema.index({ orgId: 1, key: 1 }, { unique: true })

export const McpIdempotency = defineModel('McpIdempotency', McpIdempotencySchema)
