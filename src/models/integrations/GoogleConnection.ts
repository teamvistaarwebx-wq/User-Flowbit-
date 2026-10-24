import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { GOOGLE_SERVICES } from '@/modules/google/scopes'

/**
 * One member's Google connection for one service (Calendar or Gmail send).
 * The refresh token is sealed with APP_ENCRYPTION_KEY (lib/secret-box) and
 * never leaves the server. Disconnecting revokes it and deletes the row.
 */
const GoogleConnectionSchema = new Schema(
  {
    ...tenantFields,
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    service: { type: String, enum: GOOGLE_SERVICES, required: true },
    refreshTokenSealed: { type: String, required: true },
    scope: { type: String, default: '' },
    connectedAt: { type: Date, required: true },
    lastUsedAt: { type: Date },
    /** Set when Google refused the token (revoked or expired): the member must connect again. */
    brokenAt: { type: Date },
    lastError: { type: String, maxlength: 300 },
  },
  { timestamps: true },
)
GoogleConnectionSchema.plugin(tenant)
GoogleConnectionSchema.index({ orgId: 1, memberId: 1, service: 1 }, { unique: true })

export const GoogleConnection = defineModel('GoogleConnection', GoogleConnectionSchema)
