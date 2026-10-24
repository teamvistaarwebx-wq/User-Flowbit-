import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A single-use authorization code (5 minutes), stored as its SHA-256 with the PKCE challenge it must match. */
const OAuthCodeSchema = new Schema(
  {
    ...tenantFields,
    codeHash: { type: String, required: true, unique: true },
    clientId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    scopes: { type: [String], default: [] },
    redirectUri: { type: String, required: true },
    codeChallenge: { type: String, required: true },
    resource: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    /** Set when the code was presented again: whatever it produced, now or later, is revoked. */
    replayedAt: { type: Date, default: null },
    grantId: { type: Schema.Types.ObjectId, ref: 'OAuthGrant', default: null },
  },
  { timestamps: true },
)
OAuthCodeSchema.plugin(tenant)
// Removed an hour after expiry (kept that long so a replay can still revoke what the code produced).
OAuthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 })

export const OAuthCode = defineModel('OAuthCode', OAuthCodeSchema)
