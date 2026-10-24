import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { guardFrozenUpdate } from '@/modules/folio/invoices/guard'
import { CREDIT_NOTE_FROZEN, taxCoherenceError } from '@/modules/folio/invoices/rules'
import { CREDIT_NOTE_REASONS, CREDIT_NOTE_STATUSES, DOCUMENT_TYPES, SUPPLY_TYPES } from '@/modules/folio/types'
import { paise, percent, requiredIsoDate } from './_fields'

/**
 * A credit note: issued on creation, always against one invoice. Its figures
 * are frozen; only cancellation changes it, and its number stays spent.
 */

const CreditLineSchema = new Schema(
  {
    invoiceLineId: { type: Schema.Types.ObjectId, required: true },
    description: { type: String, required: true },
    hsnSac: { type: String, default: null },
    taxablePaise: paise(),
    gstRatePercent: percent(0),
    cgstPaise: paise(),
    sgstPaise: paise(),
    igstPaise: paise(),
    lineTotalPaise: paise(),
  },
  { _id: true },
)

const CreditNoteSchema = new Schema(
  {
    ...tenantFields,
    number: { type: String, required: true },
    fyLabel: { type: String, required: true },
    seq: { type: Number, required: true },
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    documentType: { type: String, enum: DOCUMENT_TYPES, required: true },
    status: { type: String, enum: CREDIT_NOTE_STATUSES, default: 'issued' },
    noteDate: requiredIsoDate(),
    reason: { type: String, enum: CREDIT_NOTE_REASONS, required: true },
    reasonText: { type: String, required: true, minlength: 5, trim: true },
    supplyType: { type: String, enum: SUPPLY_TYPES, required: true },
    placeOfSupplyStateCode: { type: String, default: null },
    clientGstin: { type: String, default: null },
    entityGstin: { type: String, default: null },
    /** Copied from the invoice: under reverse charge the GST is shown but not in the total. */
    reverseCharge: { type: Boolean, default: false },
    lines: { type: [CreditLineSchema], default: [] },
    taxablePaise: paise(),
    cgstPaise: paise(),
    sgstPaise: paise(),
    igstPaise: paise(),
    roundOffPaise: { type: Number, default: 0 },
    totalPaise: paise(),
    issuedAt: { type: Date, default: null },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    cancelReason: { type: String },
    lastEmailedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
CreditNoteSchema.plugin(tenant)
CreditNoteSchema.index({ orgId: 1, entityId: 1, number: 1 }, { unique: true })
CreditNoteSchema.index({ orgId: 1, invoiceId: 1 })
CreditNoteSchema.index({ orgId: 1, clientId: 1, noteDate: -1 })

CreditNoteSchema.pre('validate', function coherentCreditNote() {
  const issue = taxCoherenceError({ documentType: this.documentType, cgstPaise: this.cgstPaise, sgstPaise: this.sgstPaise, igstPaise: this.igstPaise, entityGstin: this.entityGstin })
  if (issue) throw new Error(issue)
  if (!(this.totalPaise > 0)) throw new Error('A credit note must be for more than zero.')
})

const lockedNote = (number: string | null) => `Credit note ${number ?? ''} is issued and its figures are locked. Cancel it and raise a new one instead.`
const always = () => true
CreditNoteSchema.pre('findOneAndUpdate', async function () {
  await guardFrozenUpdate(this, CREDIT_NOTE_FROZEN, always, lockedNote)
})
CreditNoteSchema.pre('updateOne', async function () {
  await guardFrozenUpdate(this, CREDIT_NOTE_FROZEN, always, lockedNote)
})
CreditNoteSchema.pre('updateMany', async function () {
  await guardFrozenUpdate(this, CREDIT_NOTE_FROZEN, always, lockedNote)
})

export const CreditNote = defineModel('CreditNote', CreditNoteSchema)
