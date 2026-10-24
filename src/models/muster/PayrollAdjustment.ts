import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A one-time earning or deduction for one person in one payroll month. Voided, never deleted. */
const PayrollAdjustmentSchema = new Schema(
  {
    ...tenantFields,
    cycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    lineType: { type: String, enum: ['earning', 'deduction'], required: true },
    label: { type: String, required: true, trim: true },
    /** Paise, positive. */
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String },
  },
  { timestamps: true },
)
PayrollAdjustmentSchema.plugin(tenant)
PayrollAdjustmentSchema.index({ orgId: 1, cycleId: 1, employeeId: 1 })

export const PayrollAdjustment = defineModel('PayrollAdjustment', PayrollAdjustmentSchema)
