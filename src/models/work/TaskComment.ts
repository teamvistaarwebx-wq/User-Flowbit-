import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { ImageRefSchema } from './image-ref'

const ReactionSchema = new Schema(
  {
    emoji: { type: String, required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

const TaskCommentSchema = new Schema(
  {
    ...tenantFields,
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    /** Top-level comment this replies to (one level deep). */
    parentId: { type: Schema.Types.ObjectId, ref: 'TaskComment', default: null },
    mentionIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Member' }], default: [] },
    /** Inline images (lib/inline-images), up to 4. */
    images: { type: [ImageRefSchema], default: [] },
    reactions: { type: [ReactionSchema], default: [] },
    editedAt: { type: Date },
  },
  { timestamps: true },
)
TaskCommentSchema.plugin(tenant)
TaskCommentSchema.index({ orgId: 1, taskId: 1, createdAt: -1 })
TaskCommentSchema.index({ orgId: 1, parentId: 1, createdAt: 1 })

export const TaskComment = defineModel('TaskComment', TaskCommentSchema)
