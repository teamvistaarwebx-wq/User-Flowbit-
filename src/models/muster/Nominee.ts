import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const NOMINEE_SCHEMES = ['pf', 'gratuity', 'insurance', 'other'] as const

/** A nomination for a scheme. Live shares of a scheme add up to at most 100%. */
const NomineeSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    scheme: { type: String, enum: NOMINEE_SCHEMES, required: true },
    name: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    dob: String,
    sharePercent: { type: Number, required: true, min: 0.01, max: 100 },
    address: String,
    phone: String,
    effectiveFrom: { type: String, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: Date,
    deletedReason: String,
  },
  { timestamps: true },
)
NomineeSchema.plugin(tenant)
NomineeSchema.index({ orgId: 1, employeeId: 1, scheme: 1, deletedAt: 1 })

export const Nominee = defineModel('Nominee', NomineeSchema)
