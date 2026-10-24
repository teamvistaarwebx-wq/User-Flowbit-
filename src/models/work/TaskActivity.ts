import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { ACTIVITY_TYPES } from '@/modules/work/tasks/activity'

/**
 * Work timeline rows: task events (taskId set) and project events (taskId
 * empty, projectId set). The project Activity tab reads both by projectId.
 */
const TaskActivitySchema = new Schema(
  {
    ...tenantFields,
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    /** Denormalised for the project feed. */
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    actorId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    from: { type: Schema.Types.Mixed },
    to: { type: Schema.Types.Mixed },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
)
TaskActivitySchema.plugin(tenant)
TaskActivitySchema.index({ orgId: 1, taskId: 1, createdAt: -1 })
TaskActivitySchema.index({ orgId: 1, projectId: 1, createdAt: -1 })

export const TaskActivity = defineModel('TaskActivity', TaskActivitySchema)
