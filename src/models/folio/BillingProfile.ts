import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { isoDate, optionalPaise, paise } from './_fields'

/**
 * Per-client billing terms (one per client). Folio cannot add fields to the
 * core Client, so they live here. Created lazily: a missing profile reads as
 * defaults.
 */

const RecipientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    receivesInvoices: { type: Boolean, default: true },
    receivesReminders: { type: Boolean, default: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true },
)

const TdsSchema = new Schema(
  {
    applicable: { type: Boolean, default: false },
    section: { type: String, trim: true },
    percent: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
)

const BillingProfileSchema = new Schema(
  {
    ...tenantFields,
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    placeOfSupplyStateCode: { type: String, default: null },
    defaultEntityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', default: null },
    paymentTermsDays: { type: Number, default: null, min: 0, max: 365 },
    creditLimitPaise: optionalPaise(),
    defaultGstRatePercent: { type: Number, default: null, min: 0, max: 100 },
    tds: { type: TdsSchema, default: () => ({}) },
    isExportClient: { type: Boolean, default: false },
    recipients: { type: [RecipientSchema], default: [] },
    remindersPaused: { type: Boolean, default: false },
    openingBalancePaise: paise(),
    openingBalanceOn: isoDate(),
    notes: { type: String, trim: true },
  },
  { timestamps: true },
)
BillingProfileSchema.plugin(tenant)
BillingProfileSchema.index({ orgId: 1, clientId: 1 }, { unique: true })

BillingProfileSchema.pre('validate', function coherentProfile() {
  if (this.tds?.applicable && !(this.tds.percent > 0)) throw new Error('Enter the TDS rate, or turn TDS off.')
  if (this.recipients.filter((r) => r.isPrimary).length > 1) throw new Error('Only one recipient can be primary.')
  if (this.openingBalancePaise !== 0 && !this.openingBalanceOn) throw new Error('Give the date the opening balance is as on.')
})

export const FolioBillingProfile = defineModel('FolioBillingProfile', BillingProfileSchema)
