import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * Balances are computed (accrual − leave taken). This ledger holds what HR
 * adds on top: opening balances brought from an earlier system and manual
 * credits or debits, each with a reason. `days` may be negative.
 */
const LeaveBalanceSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    /** Leave year label, '2026-27' (or '2026' for calendar years). */
    leaveYear: { type: String, required: true },
    kind: { type: String, enum: ['opening', 'adjustment'], default: 'adjustment' },
    days: { type: Number, required: true },
    reason: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true },
)
LeaveBalanceSchema.plugin(tenant)
LeaveBalanceSchema.index({ orgId: 1, employeeId: 1, leaveYear: 1 })

export const LeaveBalance = defineModel('LeaveBalance', LeaveBalanceSchema)
