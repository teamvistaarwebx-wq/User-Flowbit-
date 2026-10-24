import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant } from '@/lib/db/tenant'

/**
 * One per org, created on first read (upsert with defaults). Only what Folio
 * reads is kept: FY is always April–March and only balances above zero are chased.
 */
const RemindersSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    offsetDays: { type: [Number], default: () => [-3, 0, 7, 15, 30] },
    channels: { type: [String], enum: ['email', 'whatsapp'], default: () => ['email'] },
    /** Org-level master switch for the daily retainer drafts. */
    autoRetainerDrafts: { type: Boolean, default: true },
  },
  { _id: false },
)

const InvoicingSchema = new Schema(
  {
    roundOffTotal: { type: Boolean, default: true },
    taxRates: { type: [Number], default: () => [0, 5, 12, 18, 28] },
    showTdsOnInvoice: { type: Boolean, default: true },
    defaultValidityDays: { type: Number, default: 15, min: 1, max: 365 },
  },
  { _id: false },
)

const FolioSettingsSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true },
    reminders: { type: RemindersSchema, default: () => ({}) },
    invoicing: { type: InvoicingSchema, default: () => ({}) },
    /** Tally export: company name and Flowbit account → Tally ledger names (modules/folio/tally/ledgers; blanks use the defaults). */
    tally: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
)
FolioSettingsSchema.plugin(tenant)

export const FolioSettings = defineModel('FolioSettings', FolioSettingsSchema)
