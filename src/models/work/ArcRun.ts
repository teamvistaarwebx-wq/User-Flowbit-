import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const ARC_KINDS = ['search', 'outline', 'breakdown', 'progress'] as const
export type ArcKind = (typeof ARC_KINDS)[number]
export const ARC_STATUSES = ['answered', 'draft', 'applied', 'discarded'] as const
export type ArcStatus = (typeof ARC_STATUSES)[number]

/** One Arc exchange: the prompt, what Arc produced, and whether a person applied it. */
const ArcRunSchema = new Schema(
  {
    ...tenantFields,
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    kind: { type: String, enum: ARC_KINDS, required: true },
    /** What the person asked, as shown in the thread. */
    prompt: { type: String, required: true, maxlength: 500 },
    input: { type: Schema.Types.Mixed, default: {} },
    output: { type: Schema.Types.Mixed, default: {} },
    source: { type: String, enum: ['ai', 'template'], default: 'template' },
    status: { type: String, enum: ARC_STATUSES, default: 'answered' },
    appliedAt: { type: Date },
    applied: {
      projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
      taskIds: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
      milestoneIds: [{ type: Schema.Types.ObjectId }],
      postId: { type: Schema.Types.ObjectId, ref: 'Post' },
    },
  },
  { timestamps: true },
)
ArcRunSchema.plugin(tenant)
ArcRunSchema.index({ orgId: 1, memberId: 1, createdAt: -1 })

export const ArcRun = defineModel('ArcRun', ArcRunSchema)
