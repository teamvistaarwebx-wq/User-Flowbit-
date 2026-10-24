import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A dated set of statutory rates (rupees, as the law states them). Never
 * edited once confirmed: corrections are new versions. `settings` is parsed
 * with `parseStatutory` (modules/muster/payroll/statutory.ts).
 */
const StatutoryVersionSchema = new Schema(
  {
    ...tenantFields,
    /** The legal date the rates took effect (may be mid-month). */
    effectiveFrom: { type: String, required: true },
    /** First payroll month that applies them: always the 1st. */
    payrollFrom: { type: String, required: true },
    note: { type: String },
    settings: { type: Schema.Types.Mixed, required: true },
    confirmedAt: { type: Date },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedByName: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
StatutoryVersionSchema.plugin(tenant)
StatutoryVersionSchema.index({ orgId: 1, payrollFrom: 1 })

export const StatutoryVersion = defineModel('StatutoryVersion', StatutoryVersionSchema)
