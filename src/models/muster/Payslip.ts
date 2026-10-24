import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A published payslip. The PDF is rendered from the entry and its snapshot, so it never drifts. */
const PayslipSchema = new Schema(
  {
    ...tenantFields,
    entryId: { type: Schema.Types.ObjectId, ref: 'PayrollEntry', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    cycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle', required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    payslipNumber: { type: String, required: true },
    /** The PDF as emailed (StoredFile); downloads re-render from the snapshot. */
    fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    netPay: { type: Number, required: true },
    generatedAt: { type: Date, required: true },
    emailedAt: { type: Date },
    emailError: { type: String },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true },
)
PayslipSchema.plugin(tenant)
PayslipSchema.index({ orgId: 1, entryId: 1 }, { unique: true })
PayslipSchema.index({ orgId: 1, payslipNumber: 1 }, { unique: true })
PayslipSchema.index({ orgId: 1, employeeId: 1, isPublished: 1 })
// publishPayslips upserts on { cycleId, employeeId } and re-flags by cycleId.
PayslipSchema.index({ orgId: 1, cycleId: 1, employeeId: 1 })

export const Payslip = defineModel('Payslip', PayslipSchema)
