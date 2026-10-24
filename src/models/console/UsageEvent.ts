import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { USAGE_KINDS, USAGE_RETENTION_DAYS } from '@/lib/usage-kinds'

/**
 * One product moment (lib/usage recordUsage). Not tenant-plugged: a login can
 * happen before the user has a workspace, so `orgId` is optional. Written
 * fire-and-forget; never read by product code, only by Flowbit staff screens.
 */
const UsageEventSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    kind: { type: String, enum: USAGE_KINDS, required: true },
    product: { type: String },
    /** Small context ({ limit: 'seats' }, { to: 'done' }); never personal data. */
    meta: { type: Schema.Types.Mixed },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
)
UsageEventSchema.index({ orgId: 1, kind: 1, at: -1 })
UsageEventSchema.index({ at: 1 }, { expireAfterSeconds: USAGE_RETENTION_DAYS * 86_400 })

export const UsageEvent = defineModel('UsageEvent', UsageEventSchema)
