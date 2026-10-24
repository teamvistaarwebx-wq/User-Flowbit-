import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { isValidGstin, stateCodeOfGstin } from '@/modules/folio/engine/gst'
import { FY_FORMATS } from '@/modules/folio/engine/numbering'
import { seriesLengthProblems } from '@/modules/folio/engine/series-rules'
import { ENTITY_KINDS } from '@/modules/folio/types'

/**
 * A business that bills. A GST entity issues Tax Invoices; a non-GST entity
 * issues Sale Invoices (no tax, no GSTIN). `documentType` is derived from
 * `kind`, never stored here.
 */

const BankAccountSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true, match: /^\d{9,18}$/ },
    ifsc: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z]{4}0[A-Z0-9]{6}$/ },
    bankName: { type: String, required: true, trim: true },
    branch: { type: String, trim: true },
    upiId: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
)

const AddressSchema = new Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    /** GST state code (2 digits); drives CGST/SGST vs IGST. */
    stateCode: { type: String, required: true, match: /^\d{2}$/ },
    pincode: { type: String, required: true, match: /^[1-9]\d{5}$/ },
    country: { type: String, default: 'India' },
  },
  { _id: false },
)

const PREFIX = /^[A-Z0-9-]{1,12}$/
const SeriesSchema = new Schema(
  {
    invoicePrefix: { type: String, required: true, match: PREFIX },
    creditNotePrefix: { type: String, required: true, match: PREFIX },
    receiptPrefix: { type: String, required: true, match: PREFIX },
    quotePrefix: { type: String, required: true, match: PREFIX },
    proformaPrefix: { type: String, required: true, match: PREFIX },
    padding: { type: Number, default: 4, min: 3, max: 6 },
    /** How the year prints: absent means 'long' (2026-27), the format before the 16-character rule. */
    fyFormat: { type: String, enum: FY_FORMATS },
  },
  { _id: false },
)

const DefaultsSchema = new Schema(
  {
    paymentTermsDays: { type: Number, default: 15, min: 0, max: 365 },
    terms: { type: String },
    notes: { type: String },
    gstRatePercent: { type: Number, default: 18, min: 0, max: 100 },
  },
  { _id: false },
)

const EntitySchema = new Schema(
  {
    ...tenantFields,
    code: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z0-9]{2,10}$/ },
    legalName: { type: String, required: true, trim: true },
    tradeName: { type: String, trim: true },
    kind: { type: String, enum: ENTITY_KINDS, required: true },
    gstin: { type: String, uppercase: true, trim: true },
    pan: { type: String, uppercase: true, trim: true },
    cinLlpin: { type: String, trim: true },
    address: { type: AddressSchema, required: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    logoFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    signatoryName: { type: String, trim: true },
    signatoryTitle: { type: String, trim: true },
    signatureFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    bankAccounts: { type: [BankAccountSchema], default: [] },
    series: { type: SeriesSchema, required: true },
    defaults: { type: DefaultsSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
)
EntitySchema.plugin(tenant)
EntitySchema.index({ orgId: 1, code: 1 }, { unique: true })

EntitySchema.pre('validate', function coherentEntity() {
  if (this.kind === 'gst') {
    if (!this.gstin || !isValidGstin(this.gstin)) throw new Error('A GST-registered firm must have a GSTIN.')
    if (stateCodeOfGstin(this.gstin) !== this.address?.stateCode) throw new Error(`This GSTIN is registered in state ${stateCodeOfGstin(this.gstin)}, but the address is in state ${this.address?.stateCode}.`)
  } else if (this.gstin) {
    throw new Error('A non-GST firm cannot hold a GSTIN.')
  }
  if (this.bankAccounts.filter((b) => b.isDefault).length > 1) throw new Error('Only one account can be the default.')
  // Only a new or changed series is checked, so an older long series does not block saving other fields.
  if (this.series && (this.isNew || this.isModified('series'))) {
    const [problem] = seriesLengthProblems(this.series)
    if (problem) throw new Error(problem.message)
  }
})

export const FolioEntity = defineModel('FolioEntity', EntitySchema)
