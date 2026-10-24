import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { DEAL_STATUSES } from '@/modules/orbit/constants'
import { NextFollowUpSchema, ReasonSchema } from './Lead'

export { DEAL_STATUSES }

const DealSchema = new Schema(
  {
    ...tenantFields,
    title: { type: String, required: true, trim: true, maxlength: 140 },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    valuePaise: { type: Number, required: true, min: 0 },
    /** A deal stage key from OrbitSettings, or 'won' / 'lost'. */
    stage: { type: String, required: true },
    probability: { type: Number, required: true, min: 0, max: 100 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    expectedCloseDate: { type: String },
    status: { type: String, enum: DEAL_STATUSES, default: 'open', required: true },
    /** _id of an entry in the client's contacts. */
    contactId: { type: Schema.Types.ObjectId },
    source: { type: String },
    sector: { type: String },
    lostReason: { type: ReasonSchema, default: null },
    wonReason: { type: String, default: null },
    closedAt: { type: Date, default: null },
    stageChangedAt: { type: Date, default: () => new Date() },
    lastActivityAt: { type: Date, default: () => new Date() },
    nextFollowUp: { type: NextFollowUpSchema, default: null },
    notes: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  },
  { timestamps: true },
)
DealSchema.plugin(tenant)
DealSchema.index({ orgId: 1, status: 1, stage: 1 })
DealSchema.index({ orgId: 1, ownerId: 1, status: 1 })
DealSchema.index({ orgId: 1, clientId: 1 })
DealSchema.index({ orgId: 1, leadId: 1 })
DealSchema.index({ orgId: 1, closedAt: -1 })
DealSchema.index({ orgId: 1, expectedCloseDate: 1 })

export const Deal = defineModel('Deal', DealSchema)
