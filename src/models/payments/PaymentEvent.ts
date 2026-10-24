import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const PAYMENT_EVENT_STATUSES = ['processing', 'done', 'failed', 'ignored'] as const

/**
 * One gateway payment seen by a workspace webhook. The unique payment id is
 * what makes the webhook idempotent: a repeat delivery finds the row and
 * records nothing twice; a failed one is retried by the gateway's next try.
 */
const PaymentEventSchema = new Schema(
  {
    ...tenantFields,
    provider: { type: String, enum: ['razorpay'], default: 'razorpay' },
    paymentId: { type: String, required: true },
    event: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    providerLinkId: { type: String },
    amountPaise: { type: Number },
    status: { type: String, enum: PAYMENT_EVENT_STATUSES, default: 'processing' },
    receiptId: { type: Schema.Types.ObjectId, ref: 'FolioReceipt' },
    note: { type: String },
    attempts: { type: Number, default: 1 },
  },
  { timestamps: true },
)
PaymentEventSchema.plugin(tenant)
// Once per payment per workspace: a global key let one workspace's forged event (signed with its own secret) block another's (V2-REVIEW P3).
PaymentEventSchema.index({ provider: 1, orgId: 1, paymentId: 1 }, { unique: true })
/** Retention (modules/privacy/retention): rows past the retention period are found by date across workspaces. */
PaymentEventSchema.index({ createdAt: 1 })

export const PaymentEvent = defineModel('PaymentEvent', PaymentEventSchema)
