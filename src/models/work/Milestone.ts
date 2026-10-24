import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { MILESTONE_STATUSES } from '@/modules/work/projects/constants'

const MilestoneSchema = new Schema(
  {
    ...tenantFields,
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 1000 },
    /** 'YYYY-MM-DD' */
    dueDate: { type: String, required: true },
    status: { type: String, enum: MILESTONE_STATUSES, default: 'open' },
    doneAt: { type: Date },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)
MilestoneSchema.plugin(tenant)
MilestoneSchema.index({ orgId: 1, projectId: 1, dueDate: 1 })

export const Milestone = defineModel('Milestone', MilestoneSchema)
