import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const

/** One signature on a routed request (leave, correction, comp-off). */
export const DecisionSchema = new Schema(
  {
    stage: { type: String, required: true },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedByName: String,
    decidedAt: { type: Date, default: () => new Date() },
    note: String,
  },
  { _id: false },
)

/** Fields every routed request carries (manager → HR approval). */
export const routingFields = {
  stages: { type: [String], default: [] },
  completedStages: { type: [String], default: [] },
  decisions: { type: [DecisionSchema], default: [] },
  /** The employee's reporting manager when it was raised (Employee id). */
  managerId: { type: Schema.Types.ObjectId, ref: 'Employee' },
  raisedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  raisedByName: String,
  decidedAt: Date,
  decisionNote: String,
} as const

const LeaveRequestSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    leaveCode: { type: String, required: true },
    leaveName: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    isHalfDay: { type: Boolean, default: false },
    /** Which half of the day a half-day request covers; two halves on one date can both stand. */
    halfDaySession: { type: String, enum: ['first', 'second'] },
    dayCount: { type: Number, required: true, min: 0 },
    paidDays: { type: Number, default: 0 },
    unpaidDays: { type: Number, default: 0 },
    /** Days the leave covers (weekly offs and holidays excluded). */
    dates: { type: [String], default: [] },
    /** The dates paid as loss of pay (the last ones the balance did not cover). */
    unpaidDates: { type: [String], default: [] },
    reason: { type: String, required: true },
    status: { type: String, enum: REQUEST_STATUSES, default: 'pending' },
    attachmentFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    cancelledAt: Date,
    cancelReason: String,
    ...routingFields,
  },
  { timestamps: true },
)
LeaveRequestSchema.plugin(tenant)
LeaveRequestSchema.index({ orgId: 1, employeeId: 1, startDate: 1 })
LeaveRequestSchema.index({ orgId: 1, status: 1 })

export const LeaveRequest = defineModel('LeaveRequest', LeaveRequestSchema)
