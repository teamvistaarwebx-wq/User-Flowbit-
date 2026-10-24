import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { ACCRUAL_MODELS } from '@/modules/muster/leave/accrual'

/**
 * A kind of leave. `carryForwardCap` null = no ceiling, 0 = lapses;
 * `proofRequiredAfterDays` null = never, 0 = always.
 */
const LeaveTypeSchema = new Schema(
  {
    ...tenantFields,
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    isPaid: { type: Boolean, default: true },
    annualQuota: { type: Number, default: 0, min: 0, max: 365 },
    accrualModel: { type: String, enum: ACCRUAL_MODELS, default: 'monthly' },
    accrualPerMonth: { type: Number, default: 0, min: 0, max: 31 },
    carryForwardCap: { type: Number, default: null },
    isEncashable: { type: Boolean, default: false },
    proofRequiredAfterDays: { type: Number, default: null },
    allowHalfDay: { type: Boolean, default: true },
    requiresProof: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)
LeaveTypeSchema.plugin(tenant)
LeaveTypeSchema.index({ orgId: 1, code: 1 }, { unique: true })

export const LeaveType = defineModel('LeaveType', LeaveTypeSchema)
