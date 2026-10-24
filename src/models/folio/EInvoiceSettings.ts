import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * E-invoicing for one GST entity (Folio settings → E-invoice): on or off, the
 * turnover flag (aggregate turnover above the e-invoice threshold), sandbox or
 * production, and the GSP login. Secrets are sealed with APP_ENCRYPTION_KEY
 * (lib/secret-box) and never sent to a page.
 */
const EInvoiceSettingsSchema = new Schema(
  {
    ...tenantFields,
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    enabled: { type: Boolean, default: false },
    turnoverAboveThreshold: { type: Boolean, default: false },
    environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
    /** The GSP's API base, https only (a public host). */
    baseUrl: { type: String, trim: true },
    clientId: { type: String, trim: true },
    clientSecretSealed: { type: String },
    username: { type: String, trim: true },
    passwordSealed: { type: String },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
EInvoiceSettingsSchema.plugin(tenant)
EInvoiceSettingsSchema.index({ orgId: 1, entityId: 1 }, { unique: true })

export const EInvoiceSettings = defineModel('EInvoiceSettings', EInvoiceSettingsSchema)
