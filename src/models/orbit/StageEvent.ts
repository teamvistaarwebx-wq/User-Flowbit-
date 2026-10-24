import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** Append-only history of lead and deal stage changes (written only by Orbit's stage actions). */
const StageEventSchema = new Schema(
  {
    ...tenantFields,
    entity: { type: String, enum: ['lead', 'deal'], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    /** null = created. */
    fromStage: { type: String, default: null },
    toStage: { type: String, required: true },
    reasonCode: { type: String, default: null },
    reasonNote: { type: String, default: null },
    /** null for seed/system rows. */
    changedBy: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    changedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
)
StageEventSchema.plugin(tenant)
StageEventSchema.index({ orgId: 1, entity: 1, entityId: 1, changedAt: 1 })
StageEventSchema.index({ orgId: 1, entity: 1, toStage: 1, changedAt: -1 })

export const StageEvent = defineModel('StageEvent', StageEventSchema)
