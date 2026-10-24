import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { CLAIM_FORM_STATUSES } from '@/modules/muster/claims/constants'

const ClaimFormSchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    /** Globally unique: /c/[slug] carries no workspace. */
    slugLower: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String },
    /** IST 00:00 of the first day. */
    opensAt: { type: Date, required: true },
    /** IST 23:59:59 of the deadline day. */
    closesAt: { type: Date, required: true },
    status: { type: String, enum: CLAIM_FORM_STATUSES, default: 'open' },
    eligibility: { type: String, enum: ['all', 'selected'], default: 'all' },
    eligibleEmployeeIds: [{ type: Schema.Types.ObjectId, ref: 'Employee' }],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'ClaimCategory' }],
    requiresReceipt: { type: Boolean, default: true },
    /** Paise; null = no cap beyond the global one. */
    maxClaimAmount: { type: Number, default: null },
    includeInPayroll: { type: Boolean, default: true },
    payrollYear: { type: Number },
    payrollMonth: { type: Number },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
ClaimFormSchema.plugin(tenant)
ClaimFormSchema.index({ slugLower: 1 }, { unique: true })
ClaimFormSchema.index({ orgId: 1, status: 1 })

export const ClaimForm = defineModel('ClaimForm', ClaimFormSchema)
