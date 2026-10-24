import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const PAYMENT_LINK_STATUSES = ['created', 'paid', 'cancelled', 'expired'] as const

/** A Razorpay payment link for one invoice's balance (the invoice number is its reference). */
const PaymentLinkSchema = new Schema(
  {
    ...tenantFields,
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    provider: { type: String, enum: ['razorpay'], default: 'razorpay' },
    providerLinkId: { type: String, required: true },
    shortUrl: { type: String, required: true },
    referenceId: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    status: { type: String, enum: PAYMENT_LINK_STATUSES, default: 'created' },
    paidAt: { type: Date },
    paymentId: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
PaymentLinkSchema.plugin(tenant)
PaymentLinkSchema.index({ provider: 1, providerLinkId: 1 }, { unique: true })
PaymentLinkSchema.index({ orgId: 1, invoiceId: 1, createdAt: -1 })
/** One live link per invoice: two quick clicks cannot both keep a link (the loser's is cancelled). */
PaymentLinkSchema.index({ orgId: 1, invoiceId: 1 }, { unique: true, partialFilterExpression: { status: 'created' } })

export const PaymentLink = defineModel('PaymentLink', PaymentLinkSchema)
