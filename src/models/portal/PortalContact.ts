import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A client's person who may open the client portal (modules/portal): invited
 * by the agency, signs in with an emailed code, sees only their own client.
 * One email belongs to one client per workspace.
 */
const PortalContactSchema = new Schema(
  {
    ...tenantFields,
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    invitedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    invitedAt: { type: Date, default: () => new Date() },
    revokedAt: { type: Date },
    lastSignInAt: { type: Date },
  },
  { timestamps: true },
)
PortalContactSchema.plugin(tenant)
PortalContactSchema.index({ orgId: 1, email: 1 }, { unique: true })
PortalContactSchema.index({ orgId: 1, clientId: 1 })

export const PortalContact = defineModel('PortalContact', PortalContactSchema)
