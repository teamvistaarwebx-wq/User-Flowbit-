import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { RECEIPT_MODES, RECEIPT_STATUSES, receiptIssue } from '@/modules/folio/receipts/rules'

const ISO_DATE: [RegExp, string] = [/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-20']
const WHOLE_PAISE = { validator: Number.isInteger, message: 'Amounts are whole paise' }

const AllocationSchema = new Schema(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    amountPaise: { type: Number, default: 0, min: 0, validate: WHOLE_PAISE },
    tdsPaise: { type: Number, default: 0, min: 0, validate: WHOLE_PAISE },
    allocatedOn: { type: String, required: true, match: ISO_DATE },
    allocatedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { _id: true },
)

/**
 * Money received from a client (folio.md 5.6). Allocated to that client's
 * issued invoices as a separate act; what is left is advance credit. Never
 * edited or deleted: a mistake is cancelled and recorded again.
 */
const ReceiptSchema = new Schema(
  {
    ...tenantFields,
    number: { type: String, required: true },
    fyLabel: { type: String, required: true },
    seq: { type: Number, required: true },
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    receivedOn: { type: String, required: true, match: ISO_DATE },
    amountPaise: { type: Number, required: true, validate: WHOLE_PAISE },
    mode: { type: String, enum: RECEIPT_MODES, default: 'bank_transfer' },
    reference: { type: String, trim: true },
    bankAccountId: { type: Schema.Types.ObjectId },
    instrumentDate: { type: String, match: ISO_DATE },
    status: { type: String, enum: RECEIPT_STATUSES, default: 'recorded' },
    bouncedOn: { type: String, match: ISO_DATE },
    bounceReason: { type: String, trim: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'Member' },
    cancelReason: { type: String, trim: true },
    notes: { type: String, trim: true },
    allocations: { type: [AllocationSchema], default: [] },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  // 'receipts' is the collection Orbit reads for its client delete guard.
  { timestamps: true, collection: 'receipts' },
)
ReceiptSchema.plugin(tenant)
ReceiptSchema.index({ orgId: 1, entityId: 1, number: 1 }, { unique: true })
ReceiptSchema.index({ orgId: 1, clientId: 1, receivedOn: -1 })
ReceiptSchema.index({ orgId: 1, status: 1 })
ReceiptSchema.index({ orgId: 1, 'allocations.invoiceId': 1 })

ReceiptSchema.pre('validate', function () {
  const issue = receiptIssue(this.amountPaise, this.allocations ?? [])
  if (issue) this.invalidate('allocations', issue)
})

export const FolioReceipt = defineModel('FolioReceipt', ReceiptSchema)
