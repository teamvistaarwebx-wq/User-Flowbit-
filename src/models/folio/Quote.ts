import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { taxCoherenceError } from '@/modules/folio/invoices/rules'
import { DOCUMENT_TYPES, QUOTE_KINDS, QUOTE_STATUSES, SUPPLY_TYPES } from '@/modules/folio/types'
import { pricingFields } from './Invoice'
import { requiredIsoDate } from './_fields'

/**
 * Quotes and proformas. Numbered at creation (not statutory; gaps are fine),
 * priced like invoices, editable until converted. "Expired" is derived:
 * draft or sent with `validUntil` before today.
 */
const QuoteSchema = new Schema(
  {
    ...tenantFields,
    kind: { type: String, enum: QUOTE_KINDS, default: 'quote' },
    number: { type: String, required: true },
    fyLabel: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },
    status: { type: String, enum: QUOTE_STATUSES, default: 'draft' },
    quoteDate: requiredIsoDate(),
    validUntil: requiredIsoDate(),
    documentType: { type: String, enum: DOCUMENT_TYPES, required: true },
    supplyType: { type: String, enum: SUPPLY_TYPES, default: 'inter_state' },
    placeOfSupplyStateCode: { type: String, default: null },
    ...pricingFields,
    subject: { type: String, trim: true },
    notes: { type: String },
    terms: { type: String },
    sentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    declineReason: { type: String },
    /** Online acceptance on the public link (notifications-v2 §0b.19): typed name, comment, IP and time. */
    respondedName: { type: String, trim: true },
    respondedComment: { type: String, trim: true },
    respondedIp: { type: String },
    respondedOnline: { type: Boolean, default: false },
    convertedInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    /** The status before conversion, restored when the invoice is deleted or voided. */
    statusBeforeConvert: { type: String, default: null },
    lastEmailedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
QuoteSchema.plugin(tenant)
QuoteSchema.index({ orgId: 1, entityId: 1, number: 1 }, { unique: true })
QuoteSchema.index({ orgId: 1, clientId: 1, quoteDate: -1 })
QuoteSchema.index({ orgId: 1, status: 1 })

QuoteSchema.pre('validate', function coherentQuote() {
  if (this.validUntil < this.quoteDate) throw new Error('A quote cannot expire before its date.')
  const issue = taxCoherenceError({ documentType: this.documentType, cgstPaise: this.cgstPaise, sgstPaise: this.sgstPaise, igstPaise: this.igstPaise })
  if (issue) throw new Error(issue)
})

export const Quote = defineModel('Quote', QuoteSchema)
