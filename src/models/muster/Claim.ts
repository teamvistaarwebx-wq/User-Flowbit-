import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { CLAIM_STATUSES } from '@/modules/muster/claims/constants'

const AttachmentSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String },
    sizeBytes: { type: Number },
  },
  { _id: false },
)

const ClaimSchema = new Schema(
  {
    ...tenantFields,
    formId: { type: Schema.Types.ObjectId, ref: 'ClaimForm' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ClaimCategory', required: true },
    expenseDate: { type: String, required: true },
    /** Paise. */
    amountClaimed: { type: Number, required: true, min: 1 },
    /** Paise; null until decided. */
    amountApproved: { type: Number, default: null },
    vendor: { type: String },
    purpose: { type: String, required: true },
    project: { type: String },
    description: { type: String },
    paymentMethod: { type: String },
    status: { type: String, enum: CLAIM_STATUSES, default: 'submitted' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
    payrollCycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle' },
    paidAt: { type: Date },
    paymentReference: { type: String },
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { timestamps: true },
)
ClaimSchema.plugin(tenant)
ClaimSchema.index({ orgId: 1, employeeId: 1, status: 1 })
ClaimSchema.index({ orgId: 1, formId: 1 })
ClaimSchema.index({ orgId: 1, payrollCycleId: 1 })
ClaimSchema.index({ orgId: 1, status: 1, createdAt: -1 })

export const Claim = defineModel('Claim', ClaimSchema)
