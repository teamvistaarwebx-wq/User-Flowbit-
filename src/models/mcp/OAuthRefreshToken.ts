import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * The refresh-token family of a connected AI app: every refresh token ever
 * issued for a grant, as its SHA-256. Presenting any of them after it was
 * rotated away is reuse, and revokes the whole grant (RFC 9700 §4.14.2).
 * Rows go 30 days after expiry.
 */
const OAuthRefreshTokenSchema = new Schema(
  {
    ...tenantFields,
    grantId: { type: Schema.Types.ObjectId, ref: 'OAuthGrant', required: true, index: true },
    hash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)
OAuthRefreshTokenSchema.plugin(tenant)
OAuthRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 86_400 })

export const OAuthRefreshToken = defineModel('OAuthRefreshToken', OAuthRefreshTokenSchema)
