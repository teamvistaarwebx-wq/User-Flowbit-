import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A "payslip ready" link sent on WhatsApp (notifications-v2 §0b.7): it never
 * carries an amount, and opening the payslip needs a code sent to the
 * employee's work email. Only a SHA-256 of the random key is stored.
 */
const PayslipLinkSchema = new Schema(
  {
    ...tenantFields,
    keyHash: { type: String, required: true },
    payslipId: { type: Schema.Types.ObjectId, ref: 'Payslip', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date },
  },
  { timestamps: true },
)
PayslipLinkSchema.plugin(tenant)
PayslipLinkSchema.index({ keyHash: 1 }, { unique: true })
PayslipLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 })

export const PayslipLink = defineModel('PayslipLink', PayslipLinkSchema)
