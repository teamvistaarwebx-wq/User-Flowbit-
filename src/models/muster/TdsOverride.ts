import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * Finance replaces the computed TDS for one person in one payroll month with
 * an amount of its own, with a reason (audited). Removed, never edited: a new
 * override voids the old one. Paise.
 */
const TdsOverrideSchema = new Schema(
  {
    ...tenantFields,
    cycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
TdsOverrideSchema.plugin(tenant)
TdsOverrideSchema.index({ orgId: 1, cycleId: 1, employeeId: 1 })

export const TdsOverride = defineModel('TdsOverride', TdsOverrideSchema)
