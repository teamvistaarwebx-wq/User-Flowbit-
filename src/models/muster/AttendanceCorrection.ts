import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { routingFields } from './LeaveRequest'

/**
 * A change to one day's attendance. `kind: 'request'` is raised by the
 * employee and routed for approval; `kind: 'override'` is HR setting the day
 * directly from the register (approved on creation, reason required). The
 * latest approved row for a person and day overrides the punches.
 */
const AttendanceCorrectionSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    date: { type: String, required: true },
    kind: { type: String, enum: ['request', 'override'], default: 'request' },
    /** Where an override came from: a register cell, the daily sheet, or a CSV import. */
    source: { type: String, enum: ['register', 'daily', 'import'] },
    currentStatus: String,
    requestedStatus: { type: String, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'superseded'], default: 'pending' },
    ...routingFields,
  },
  { timestamps: true },
)
AttendanceCorrectionSchema.plugin(tenant)
AttendanceCorrectionSchema.index({ orgId: 1, employeeId: 1, date: 1, status: 1 })
AttendanceCorrectionSchema.index({ orgId: 1, status: 1, createdAt: -1 })
AttendanceCorrectionSchema.index({ orgId: 1, date: 1 })

export const AttendanceCorrection = defineModel('AttendanceCorrection', AttendanceCorrectionSchema)
