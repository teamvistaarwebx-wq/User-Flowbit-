import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const EntryLineSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    lineType: { type: String, enum: ['earning', 'deduction', 'employer_contribution', 'reimbursement'], required: true },
    amount: { type: Number, required: true },
    isAdjustment: { type: Boolean, default: false },
    reason: { type: String },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false },
)

/** One person's line in a payroll month. Money in paise; `snapshot` holds every input the engine used. */
const PayrollEntrySchema = new Schema(
  {
    ...tenantFields,
    cycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeName: { type: String, required: true },
    employeeCode: { type: String },
    monthlyGross: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    payableDays: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    earnedGross: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalEmployerContrib: { type: Number, default: 0 },
    reimbursementAmount: { type: Number, default: 0 },
    netPay: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['ready', 'on_hold', 'excluded'], default: 'ready' },
    notes: { type: String },
    warnings: { type: [String], default: [] },
    snapshot: { type: Schema.Types.Mixed },
    lines: { type: [EntryLineSchema], default: [] },
  },
  { timestamps: true },
)
PayrollEntrySchema.plugin(tenant)
PayrollEntrySchema.index({ orgId: 1, cycleId: 1, employeeId: 1 }, { unique: true })
PayrollEntrySchema.index({ orgId: 1, employeeId: 1 })

export const PayrollEntry = defineModel('PayrollEntry', PayrollEntrySchema)
