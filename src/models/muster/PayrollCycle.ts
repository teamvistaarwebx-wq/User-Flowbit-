import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { PAYROLL_STATUSES } from '@/modules/muster/payroll/stages'

const StampSchema = new Schema({ at: Date, by: { type: Schema.Types.ObjectId, ref: 'User' }, name: String }, { _id: false })

/** Hold = computed but not paid until released; exclude = no entry this month. Survives regeneration. */
const HoldSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    kind: { type: String, enum: ['hold', 'exclude'], required: true },
    reason: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

const SkippedSchema = new Schema({ employeeId: Schema.Types.ObjectId, name: String, reason: String }, { _id: false })

const PayrollCycleSchema = new Schema(
  {
    ...tenantFields,
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    periodStart: { type: String, required: true },
    periodEnd: { type: String, required: true },
    status: { type: String, enum: PAYROLL_STATUSES, default: 'attendance_open' },
    workingDays: { type: Number, default: 0 },
    /** Paise totals of the register (on-hold entries included; excluded people are not in it). */
    totalGross: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalReimbursements: { type: Number, default: 0 },
    totalNet: { type: Number, default: 0 },
    totalEmployerCost: { type: Number, default: 0 },
    employeeCount: { type: Number, default: 0 },
    claimsClosed: { type: StampSchema },
    generated: { type: StampSchema },
    hrReviewed: { type: StampSchema },
    financeApproved: { type: StampSchema },
    locked: { type: StampSchema },
    released: { type: StampSchema },
    published: { type: StampSchema },
    paymentDate: { type: String },
    paymentReference: { type: String },
    paymentNotes: { type: String },
    holds: { type: [HoldSchema], default: [] },
    /** People the last generation could not pay, with why. */
    skipped: { type: [SkippedSchema], default: [] },
    notes: { type: String },
  },
  { timestamps: true },
)
PayrollCycleSchema.plugin(tenant)
PayrollCycleSchema.index({ orgId: 1, year: 1, month: 1 }, { unique: true })

export const PayrollCycle = defineModel('PayrollCycle', PayrollCycleSchema)
