import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { OFFLINE_MODES } from '@/modules/billing/rules'

/**
 * A bank transfer or UPI payment against a Flowbit due bill (console spec 11),
 * recorded by Accounts or submitted by the customer with a screenshot. Never
 * activates on its own: 7 days of provisional access, then a different staff
 * member verifies it against the bank statement (maker-checker).
 */
const OfflinePaymentSchema = new Schema(
  {
    ...tenantFields,
    invoiceId: { type: Schema.Types.ObjectId, ref: 'SubscriptionInvoice', required: true },
    /** Normalised (no spaces, upper case). */
    utr: { type: String, required: true },
    /** Set while the row counts (pending, verified, expired); unset on rejection so the UTR may be entered again. */
    utrKey: { type: String },
    amountPaise: { type: Number, required: true },
    paidOn: { type: String, required: true },
    mode: { type: String, enum: OFFLINE_MODES, required: true },
    tdsDeclared: { type: Boolean, default: false },
    screenshotFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    status: { type: String, enum: ['pending', 'verified', 'rejected', 'expired'], default: 'pending' },
    source: { type: String, enum: ['staff', 'customer'], required: true },
    recordedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    recordedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String, required: true },
    provisionalUntil: { type: Date, required: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'Staff' },
    verifiedByName: { type: String },
    verifiedAt: { type: Date },
    rejectedReason: { type: String },
    /** What applying it did to the bill: paid, part, flagged. */
    outcome: { type: String },
    /** Why a verified payment was flagged instead of applied (V2-REVIEW M-L1). */
    flagNote: { type: String },
  },
  { timestamps: true },
)
OfflinePaymentSchema.plugin(tenant)
OfflinePaymentSchema.index({ utrKey: 1 }, { unique: true, partialFilterExpression: { utrKey: { $type: 'string' } } })
OfflinePaymentSchema.index({ status: 1, createdAt: -1 })

export const OfflinePayment = defineModel('OfflinePayment', OfflinePaymentSchema)
