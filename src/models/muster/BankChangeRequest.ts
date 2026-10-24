import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A change to someone's salary account (made in self-service). Only masked
 * numbers are kept here. HR or Finance (people.read_sensitive) verifies it
 * before the next payroll run; the payroll month lists unverified ones.
 */
const BankChangeRequestSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeName: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedBySelf: { type: Boolean, default: true },
    previousMasked: { type: String },
    newMasked: { type: String },
    previousIfsc: { type: String },
    newIfsc: { type: String },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedByName: { type: String },
  },
  { timestamps: true },
)
BankChangeRequestSchema.plugin(tenant)
BankChangeRequestSchema.index({ orgId: 1, employeeId: 1, createdAt: -1 })
BankChangeRequestSchema.index({ orgId: 1, verifiedAt: 1 })

export const BankChangeRequest = defineModel('BankChangeRequest', BankChangeRequestSchema)
