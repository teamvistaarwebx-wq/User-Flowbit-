import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { CALCULATION_TYPES, COMPONENT_TYPES } from '@/modules/muster/payroll/components'

const SalaryComponentSchema = new Schema(
  {
    ...tenantFields,
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    componentType: { type: String, enum: COMPONENT_TYPES, required: true },
    calculationType: { type: String, enum: CALCULATION_TYPES, required: true },
    /** A % for percent types, paise for fixed. */
    defaultValue: { type: Number, default: 0 },
    isTaxable: { type: Boolean, default: true },
    isRecurring: { type: Boolean, default: true },
    countsForPf: { type: Boolean, default: false },
    countsForWages: { type: Boolean, default: false },
    countsForEsi: { type: Boolean, default: false },
    prorateOnLop: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)
SalaryComponentSchema.plugin(tenant)
SalaryComponentSchema.index({ orgId: 1, code: 1 }, { unique: true })

export const SalaryComponent = defineModel('SalaryComponent', SalaryComponentSchema)
