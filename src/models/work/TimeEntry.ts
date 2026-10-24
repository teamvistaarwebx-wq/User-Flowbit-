import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const TIME_SOURCES = ['timer', 'manual'] as const
export const TIME_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const
export type TimeStatus = (typeof TIME_STATUSES)[number]

/** One block of logged time against a task or a project (timer or manual). */
const TimeEntrySchema = new Schema(
  {
    ...tenantFields,
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    /** IST date of the work ('YYYY-MM-DD'). */
    date: { type: String, required: true },
    minutes: { type: Number, default: 0, min: 0, max: 1440 },
    source: { type: String, enum: TIME_SOURCES, default: 'manual' },
    startedAt: { type: Date },
    endedAt: { type: Date },
    isRunning: { type: Boolean, default: false },
    note: { type: String, maxlength: 500 },
    billable: { type: Boolean, default: false },
    /** Monday of the entry's week ('YYYY-MM-DD'). */
    weekStart: { type: String, required: true },
    status: { type: String, enum: TIME_STATUSES, default: 'draft' },
    editedAt: { type: Date },
  },
  { timestamps: true },
)
TimeEntrySchema.plugin(tenant)
TimeEntrySchema.index({ orgId: 1, memberId: 1, weekStart: 1 })
TimeEntrySchema.index({ orgId: 1, taskId: 1 })
TimeEntrySchema.index({ orgId: 1, projectId: 1, date: 1 })
TimeEntrySchema.index({ orgId: 1, date: 1 })
TimeEntrySchema.index({ orgId: 1, memberId: 1 }, { unique: true, partialFilterExpression: { isRunning: true } })

export const TimeEntry = defineModel('TimeEntry', TimeEntrySchema)
