import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const SUBSCRIPTION_INVOICE_KINDS = ['subscription', 'upgrade', 'wallet_recharge'] as const
export const PAYMENT_PROVIDERS = ['razorpay', 'simulated', 'manual', 'offline'] as const
export const SUBSCRIPTION_INVOICE_STATUSES = ['due', 'paid', 'cancelled'] as const
export const TDS_CERT_STATUSES = ['awaited', 'received', 'matched_26as', 'mismatch'] as const

const LineSchema = new Schema(
  {
    description: { type: String, required: true },
    productKey: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPaise: { type: Number, required: true },
    /** Taxable value of the line. */
    amountPaise: { type: Number, required: true },
  },
  { _id: false },
)

/**
 * A due bill (status 'due', console spec 11) is the same document before payment:
 * it carries a bill number from its own series, a due date and a Razorpay payment
 * link. On payment it becomes the GST tax invoice: the tax number replaces the bill
 * number (kept in `billNumber`), issueDate becomes the payment date.
 *
 * A GST invoice issued by Flowbit (Sanskaar Webx Services LLP) to a workspace (platform spec 6.12).
 * Created only after money is received; never edited or deleted. Platform staff
 * may cancel one with a reason; the number stays. Supplier and customer are
 * frozen snapshots so later edits to billing details never change an invoice.
 */
const SubscriptionInvoiceSchema = new Schema(
  {
    ...tenantFields,
    /** 'FB/2026-27/0001': one series per supplier GSTIN and FY (modules/billing/series). A due bill holds its bill number here. */
    number: { type: String, required: true, unique: true },
    /** The counter key that issued `number` (old invoices: none, which means `fb-invoice:${fy}`). */
    seriesKey: { type: String },
    fy: { type: String, required: true },
    seq: { type: Number, required: true },
    kind: { type: String, enum: SUBSCRIPTION_INVOICE_KINDS, default: 'subscription' },
    status: { type: String, enum: SUBSCRIPTION_INVOICE_STATUSES, default: 'paid' },
    /** Due bills: 'bill' asks for payment; 'proforma' is the same with a proforma title. */
    billType: { type: String, enum: ['bill', 'proforma'] },
    /** The bill number it carried while due ('FB-B/2026-27/0001'). */
    billNumber: { type: String },
    /** 'YYYY-MM-DD' (IST) the bill is due. */
    dueDate: { type: String },
    /** What the payment buys: applied to the workspace when it is paid. */
    selection: { type: Schema.Types.Mixed },
    cycle: { type: String, enum: ['monthly', 'yearly'] },
    /** Due bills: the unit prices (paise per month by plan key) the bill was priced at; the plan keeps them once paid. */
    unitPrices: { type: Schema.Types.Mixed },
    paymentLink: { id: String, shortUrl: String, status: String, amountPaise: Number, createdAt: Date },
    /** Payment links made for this bill so far; a part payment re-creates the link for the balance (V2-REVIEW M-M3). */
    paymentLinkCount: { type: Number },
    /** Random key of the public bill link (/bill/<key>.<sig>). */
    publicKey: { type: String },
    /** Customer deducts TDS (console spec 11): what they declared, and the certificate's state. */
    tds: {
      declared: { type: Boolean, default: false },
      amountPaise: { type: Number, default: 0 },
      certificateFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
      certificateStatus: { type: String, enum: TDS_CERT_STATUSES },
      quarter: { type: String },
      note: { type: String },
      updatedAt: Date,
      updatedBy: { type: Schema.Types.ObjectId, ref: 'Staff' },
    },
    /** Money received against it (gateway or verified offline), for the TDS rule. */
    receivedPaise: { type: Number, default: 0 },
    /** Every payment applied to it (part payments too); a payment id appears once across all bills. */
    receipts: {
      type: [new Schema({ paymentId: { type: String, required: true }, provider: String, amountPaise: Number, at: Date, utr: String }, { _id: false })],
      default: undefined,
    },
    /** Credit notes issued against it, GST included. */
    creditedPaise: { type: Number, default: 0 },
    refundedPaise: { type: Number, default: 0 },
    createdByStaff: { type: Schema.Types.ObjectId, ref: 'Staff' },
    issueDate: { type: String, required: true },
    periodStart: { type: String, required: true },
    /** Inclusive last day, for display. */
    periodEnd: { type: String, required: true },
    supplier: {
      legalName: String,
      gstin: String,
      pan: String,
      address: String,
      stateCode2: String,
      gstStateCode: String,
      email: String,
    },
    customer: {
      legalName: String,
      gstin: String,
      email: String,
      address: { line1: String, line2: String, city: String, stateCode: String, pincode: String },
      stateCode2: String,
      gstStateCode: String,
    },
    placeOfSupply: { gstStateCode: String, name: String },
    supplyType: { type: String, enum: ['intra_state', 'inter_state', 'no_gst'], required: true },
    sac: { type: String, required: true },
    gstRate: { type: Number, default: 18 },
    lines: { type: [LineSchema], default: [] },
    taxableValuePaise: { type: Number, required: true },
    cgstPaise: { type: Number, default: 0 },
    sgstPaise: { type: Number, default: 0 },
    igstPaise: { type: Number, default: 0 },
    taxPaise: { type: Number, default: 0 },
    roundOffPaise: { type: Number, default: 0 },
    totalPaise: { type: Number, required: true },
    payment: {
      /** Required once paid; a due bill has no payment yet. */
      provider: {
        type: String,
        enum: PAYMENT_PROVIDERS,
        required: function (this: { status?: string }) {
          return this.status !== 'due'
        },
      },
      paymentId: String,
      /** Offline: the bank UTR, mode and the OfflinePayment row. */
      utr: String,
      mode: String,
      offlinePaymentId: { type: Schema.Types.ObjectId, ref: 'OfflinePayment' },
      subscriptionId: String,
      orderId: String,
      paidAt: Date,
    },
    /** Simulated payment: the PDF carries a TEST watermark. */
    isTest: { type: Boolean, default: false },
    emailedAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    /** The Console staff member who cancelled it. */
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true },
)
SubscriptionInvoiceSchema.plugin(tenant)
SubscriptionInvoiceSchema.index({ orgId: 1, issueDate: -1 })
SubscriptionInvoiceSchema.index({ status: 1, dueDate: 1 })
/** One due bill per workspace at a time: a double submit cannot create two (V2-REVIEW M-L5). */
SubscriptionInvoiceSchema.index({ orgId: 1 }, { unique: true, partialFilterExpression: { status: 'due' }, name: 'one_due_bill_per_org' })
SubscriptionInvoiceSchema.index({ 'receipts.paymentId': 1 }, { unique: true, partialFilterExpression: { 'receipts.paymentId': { $type: 'string' } } })
SubscriptionInvoiceSchema.index({ 'paymentLink.id': 1 }, { sparse: true })
SubscriptionInvoiceSchema.index({ publicKey: 1 }, { unique: true, partialFilterExpression: { publicKey: { $type: 'string' } } })
SubscriptionInvoiceSchema.index({ 'payment.paymentId': 1 }, { unique: true, partialFilterExpression: { 'payment.paymentId': { $type: 'string' } } })

export const SubscriptionInvoice = defineModel('SubscriptionInvoice', SubscriptionInvoiceSchema)
