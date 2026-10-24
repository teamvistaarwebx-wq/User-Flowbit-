import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { CALCULATION_TYPES } from '@/modules/muster/payroll/components'

const StructureLineSchema = new Schema(
  {
    componentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent' },
    code: { type: String, required: true },
    calculationType: { type: String, enum: CALCULATION_TYPES, required: true },
    /** Paise for `fixed`, a percentage otherwise. */
    value: { type: Number, required: true },
    /** Resolved full-month amount in paise (for display; the engine re-resolves). */
    monthlyAmount: { type: Number, default: 0 },
  },
  { _id: false },
)

const SalaryStructureSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    effectiveFrom: { type: String, required: true },
    /** null = the structure in force now. */
    effectiveTo: { type: String, default: null },
    /** Paise. */
    monthlyGross: { type: Number, required: true },
    /** Paise. */
    ctcAnnual: { type: Number, required: true },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lines: { type: [StructureLineSchema], default: [] },
  },
  { timestamps: true },
)
SalaryStructureSchema.plugin(tenant)
SalaryStructureSchema.index({ orgId: 1, employeeId: 1, effectiveFrom: 1 }, { unique: true })
SalaryStructureSchema.index({ orgId: 1, employeeId: 1 }, { unique: true, partialFilterExpression: { effectiveTo: null } })

export const SalaryStructure = defineModel('SalaryStructure', SalaryStructureSchema)
