import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { guardFrozenUpdate } from '@/modules/folio/invoices/guard'
import { FROZEN_FIELDS, invoiceCoherenceError, lockedMessage } from '@/modules/folio/invoices/rules'
import { BILLING_TYPES, DISCOUNT_TYPES, DOCUMENT_TYPES, INVOICE_STATUSES, SUPPLY_TYPES } from '@/modules/folio/types'
import { isoDate, paise, percent, requiredIsoDate } from './_fields'

/**
 * Tax invoices and sale invoices (SPEC cross-product model). Issued means
 * immutable: the hooks below freeze every figure a client reads, for save,
 * findOneAndUpdate, updateOne and updateMany. Only settlement, void,
 * write-off, internal notes and lastEmailedAt change after issue.
 */

/** Priced line, shared with quotes. */
export const DocumentLineSchema = new Schema(
  {
    position: { type: Number, required: true },
    serviceItemId: { type: Schema.Types.ObjectId, ref: 'FolioServiceItem', default: null },
    description: { type: String, required: true, trim: true },
    hsnSac: { type: String, default: null },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'nos' },
    ratePaise: paise({ required: true }),
    discountPercent: percent(0),
    discountPaise: paise(),
    taxablePaise: paise(),
    gstRatePercent: percent(0),
    cgstPaise: paise(),
    sgstPaise: paise(),
    igstPaise: paise(),
    lineTotalPaise: paise(),
  },
  { _id: true },
)

/** Pricing fields shared by invoices and quotes (filled from computeInvoice). */
export const pricingFields = {
  subtotalPaise: paise(),
  discountType: { type: String, enum: DISCOUNT_TYPES, default: null },
  discountValue: { type: Number, default: 0, min: 0 },
  discountPaise: paise(),
  taxablePaise: paise(),
  cgstPaise: paise(),
  sgstPaise: paise(),
  igstPaise: paise(),
  roundOffPaise: { type: Number, default: 0, validate: { validator: Number.isInteger, message: 'Round off is whole paise' } },
  totalPaise: paise(),
  lines: { type: [DocumentLineSchema], default: [] },
}

const PartySchema = new Schema(
  {
    name: String,
    addressLines: { type: [String], default: [] },
    city: String,
    stateCode: String,
    stateName: String,
    pincode: String,
    country: String,
    gstin: String,
  },
  { _id: false },
)

const IssuerSchema = new Schema(
  {
    legalName: String,
    tradeName: String,
    gstin: String,
    pan: String,
    cinLlpin: String,
    addressLines: { type: [String], default: [] },
    city: String,
    stateCode: String,
    stateName: String,
    pincode: String,
    email: String,
    phone: String,
    website: String,
    logoFileId: { type: Schema.Types.ObjectId },
    signatoryName: String,
    signatoryTitle: String,
    signatureFileId: { type: Schema.Types.ObjectId },
  },
  { _id: false },
)

const BankSnapshotSchema = new Schema(
  { accountName: String, accountNumber: String, ifsc: String, bankName: String, branch: String, upiId: String },
  { _id: false },
)

const InvoiceSchema = new Schema(
  {
    ...tenantFields,
    /** Part of the "Load sample agency" data (modules/activation/sample-data); "Remove sample data" deletes only these. */
    sample: { type: Boolean },
    number: { type: String, default: null },
    fyLabel: { type: String, default: null },
    seq: { type: Number, default: null },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    documentType: { type: String, enum: DOCUMENT_TYPES, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: 'draft' },
    issueDate: requiredIsoDate(),
    dueDate: requiredIsoDate(),
    paymentTermsDays: { type: Number, default: 15, min: 0, max: 365 },
    currency: { type: String, default: 'INR' },
    billingType: { type: String, enum: BILLING_TYPES, default: 'one_time' },
    retainerId: { type: Schema.Types.ObjectId, ref: 'FolioRetainer', default: null },
    retainerBillingDate: isoDate(),
    planId: { type: Schema.Types.ObjectId, ref: 'FolioBillingPlan', default: null },
    milestoneId: { type: Schema.Types.ObjectId, default: null },
    quoteId: { type: Schema.Types.ObjectId, ref: 'Quote', default: null },
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },
    periodStart: isoDate(),
    periodEnd: isoDate(),
    supplyType: { type: String, enum: SUPPLY_TYPES, default: 'inter_state' },
    placeOfSupplyStateCode: { type: String, default: null },
    /** The client's derived GST state when the draft was saved (null before Oct 2026); issue refuses if it changed (R3 L-25b). */
    clientStateCodeAtSave: { type: String, default: null },
    clientGstin: { type: String, default: null },
    entityGstin: { type: String, default: null },
    reverseCharge: { type: Boolean, default: false },
    billTo: { type: PartySchema, default: () => ({}) },
    from: { type: IssuerSchema, default: null },
    bankAccountId: { type: Schema.Types.ObjectId, default: null },
    bank: { type: BankSnapshotSchema, default: null },
    ...pricingFields,
    tdsPercent: percent(0),
    tdsPaise: paise(),
    paidPaise: paise(),
    tdsReceivedPaise: paise(),
    creditedPaise: paise(),
    writtenOffPaise: paise(),
    balancePaise: paise(),
    purchaseOrderRef: { type: String, trim: true },
    subject: { type: String, trim: true },
    notes: { type: String },
    terms: { type: String },
    internalNotes: { type: String },
    issuedAt: { type: Date, default: null },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    voidReason: { type: String },
    writtenOffAt: { type: Date, default: null },
    writtenOffBy: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    writeOffReason: { type: String },
    lastEmailedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
InvoiceSchema.plugin(tenant)
// Partial, not sparse: drafts (number null) must not collide with each other.
InvoiceSchema.index({ orgId: 1, entityId: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'string' } } })
InvoiceSchema.index({ orgId: 1, clientId: 1, issueDate: -1 })
InvoiceSchema.index({ orgId: 1, status: 1, dueDate: 1 })
InvoiceSchema.index({ orgId: 1, entityId: 1, fyLabel: 1, seq: 1 })
InvoiceSchema.index({ orgId: 1, retainerId: 1, retainerBillingDate: 1 })
InvoiceSchema.index({ orgId: 1, quoteId: 1 })
InvoiceSchema.index({ orgId: 1, milestoneId: 1 })

InvoiceSchema.pre('validate', function coherentInvoice() {
  const issue = invoiceCoherenceError(this)
  if (issue) throw new Error(issue)
})

InvoiceSchema.post('init', function rememberLoadedStatus(doc) {
  doc.$locals.loadedStatus = doc.status
})

InvoiceSchema.pre('save', function guardIssuedInvoice() {
  if (this.isNew) return
  const loaded = this.$locals.loadedStatus as string | undefined
  if (!loaded || loaded === 'draft') return
  if (FROZEN_FIELDS.some((field) => this.isModified(field))) throw new Error(lockedMessage(this.number))
})

const isLocked = (status: string) => status !== 'draft'
InvoiceSchema.pre('findOneAndUpdate', async function () {
  await guardFrozenUpdate(this, FROZEN_FIELDS, isLocked, lockedMessage)
})
InvoiceSchema.pre('updateOne', async function () {
  await guardFrozenUpdate(this, FROZEN_FIELDS, isLocked, lockedMessage)
})
InvoiceSchema.pre('updateMany', async function () {
  await guardFrozenUpdate(this, FROZEN_FIELDS, isLocked, lockedMessage)
})

export const Invoice = defineModel('Invoice', InvoiceSchema)
