import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A client portal sign-in code: stored as an HMAC only, five guesses, gone 10 minutes after it expires (TTL). */
const PortalCodeSchema = new Schema(
  {
    ...tenantFields,
    contactId: { type: Schema.Types.ObjectId, ref: 'PortalContact', required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
PortalCodeSchema.plugin(tenant)
PortalCodeSchema.index({ orgId: 1, contactId: 1, createdAt: -1 })
PortalCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 })

export const PortalCode = defineModel('PortalCode', PortalCodeSchema)
