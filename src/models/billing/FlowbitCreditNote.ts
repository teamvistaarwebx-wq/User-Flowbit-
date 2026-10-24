import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { CREDIT_REASONS } from '@/modules/billing/rules'

/**
 * A GST credit note Flowbit issues against one of its paid tax invoices
 * (console spec 11, the pattern of Folio credit notes), with the refund to the
 * original Razorpay payment when there is one. Never edited or deleted.
 */
const FlowbitCreditNoteSchema = new Schema(
  {
    ...tenantFields,
    invoiceId: { type: Schema.Types.ObjectId, ref: 'SubscriptionInvoice', required: true },
    invoiceNumber: { type: String, required: true },
    number: { type: String, required: true, unique: true },
    seriesKey: { type: String, required: true },
    fy: { type: String, required: true },
    issueDate: { type: String, required: true },
    reason: { type: String, enum: CREDIT_REASONS, required: true },
    note: { type: String, trim: true },
    supplyType: { type: String, enum: ['intra_state', 'inter_state', 'no_gst'], required: true },
    taxableValuePaise: { type: Number, required: true },
    cgstPaise: { type: Number, default: 0 },
    sgstPaise: { type: Number, default: 0 },
    igstPaise: { type: Number, default: 0 },
    totalPaise: { type: Number, required: true },
    refund: {
      status: { type: String, enum: ['none', 'processed', 'pending', 'failed'], default: 'none' },
      razorpayRefundId: String,
      amountPaise: Number,
      error: String,
      at: Date,
    },
    createdByStaff: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    createdByName: { type: String, required: true },
  },
  { timestamps: true },
)
FlowbitCreditNoteSchema.plugin(tenant)
FlowbitCreditNoteSchema.index({ invoiceId: 1 })

export const FlowbitCreditNote = defineModel('FlowbitCreditNote', FlowbitCreditNoteSchema)
