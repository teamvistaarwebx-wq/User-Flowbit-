import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * Replay guard for inbound webhooks that create records (connectors/
 * inbound-replay): one row per accepted request key (the sender's id, a nonce
 * or the body's hash), claimed before the record is made, so a replayed or
 * doubled request is refused even when both arrive at once. Rows expire.
 */
const InboundReplaySchema = new Schema(
  {
    ...tenantFields,
    key: { type: String, required: true },
    recordId: { type: Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)
InboundReplaySchema.plugin(tenant)
InboundReplaySchema.index({ orgId: 1, key: 1 }, { unique: true })
InboundReplaySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const InboundReplay = defineModel('InboundReplay', InboundReplaySchema)
