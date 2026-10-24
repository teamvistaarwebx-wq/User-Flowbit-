import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { TIME_STATUSES } from './TimeEntry'

/** A member's week of time (Monday start): draft -> submitted -> approved | rejected. */
const TimesheetSchema = new Schema(
  {
    ...tenantFields,
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    weekStart: { type: String, required: true },
    status: { type: String, enum: TIME_STATUSES, default: 'draft' },
    totalMinutes: { type: Number, default: 0 },
    billableMinutes: { type: Number, default: 0 },
    submittedAt: { type: Date },
    approverId: { type: Schema.Types.ObjectId, ref: 'Member' },
    decidedAt: { type: Date },
    decidedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    reason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
)
TimesheetSchema.plugin(tenant)
TimesheetSchema.index({ orgId: 1, memberId: 1, weekStart: 1 }, { unique: true })
TimesheetSchema.index({ orgId: 1, status: 1, weekStart: -1 })

export const Timesheet = defineModel('Timesheet', TimesheetSchema)
