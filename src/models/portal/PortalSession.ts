import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A client portal session (cookie `fb_portal`, host-only, path /portal). Its
 * own collection, never the product's Session: a portal cookie cannot open
 * /app, and a member's session cannot open the portal.
 */
const PortalSessionSchema = new Schema(
  {
    ...tenantFields,
    contactId: { type: Schema.Types.ObjectId, ref: 'PortalContact', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true },
)
PortalSessionSchema.plugin(tenant)
PortalSessionSchema.index({ orgId: 1, contactId: 1 })
PortalSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const PortalSession = defineModel('PortalSession', PortalSessionSchema)
