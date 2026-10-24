import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** Sequence emails one sender sent on one IST day: the daily cap's counter (claimed with a conditional $inc). */
const SequenceSendCountSchema = new Schema(
  {
    ...tenantFields,
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true },
)
SequenceSendCountSchema.plugin(tenant)
SequenceSendCountSchema.index({ orgId: 1, memberId: 1, day: 1 }, { unique: true })
SequenceSendCountSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 86_400 })

export const SequenceSendCount = defineModel('SequenceSendCount', SequenceSendCountSchema)
