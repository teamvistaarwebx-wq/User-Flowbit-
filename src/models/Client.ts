import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const CLIENT_STATUSES = ['lead', 'active', 'inactive'] as const
export const CLIENT_KINDS = ['company', 'individual'] as const

const ContactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String },
    role: { type: String },
    primary: { type: Boolean, default: false },
  },
  { _id: true },
)

const ClientSchema = new Schema(
  {
    ...tenantFields,
    /** Part of the "Load sample agency" data (modules/activation/sample-data); "Remove sample data" deletes only these. */
    sample: { type: Boolean },
    name: { type: String, required: true, trim: true },
    displayName: { type: String, trim: true },
    /** Client logo (JPEG/PNG, resized in the browser): a StoredFile of kind 'client_logo'; shows on the client's tasks. */
    logoFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    kind: { type: String, enum: CLIENT_KINDS, default: 'company' },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String },
    website: { type: String },
    gstin: { type: String, uppercase: true, trim: true },
    pan: { type: String, uppercase: true, trim: true },
    /** Two-letter state code, e.g. 'MP' (drives CGST+SGST vs IGST in Folio). */
    state: { type: String, uppercase: true },
    billingAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },
    contacts: { type: [ContactSchema], default: [] },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Member' },
    tags: { type: [String], default: [] },
    source: { type: String },
    sector: { type: String },
    status: { type: String, enum: CLIENT_STATUSES, default: 'active' },
    notes: { type: String },
    /** Client portal (modules/portal): on for this client; its contacts are PortalContact rows. */
    portal: { type: new Schema({ enabled: { type: Boolean, default: false }, enabledAt: Date }, { _id: false }), default: undefined },
  },
  { timestamps: true },
)
ClientSchema.plugin(tenant)
ClientSchema.index({ orgId: 1, name: 1 })
ClientSchema.index({ orgId: 1, status: 1 })
/** "Recently updated" and "Newest first" sorts, the onboarding filters and the new-clients chart. */
ClientSchema.index({ orgId: 1, updatedAt: -1 })
ClientSchema.index({ orgId: 1, createdAt: -1 })

export const Client = defineModel('Client', ClientSchema)
