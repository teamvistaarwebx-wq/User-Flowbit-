import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * One connected AI app: one person, one workspace, one client, the approved
 * scopes, and the current access and refresh tokens as SHA-256 hashes.
 * Refresh rotates both tokens; every refresh token ever issued is kept in
 * OAuthRefreshToken, so reuse of any old one revokes the grant. Settings → Connected apps lists and revokes these.
 */
const OAuthGrantSchema = new Schema(
  {
    ...tenantFields,
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    clientId: { type: String, required: true },
    clientName: { type: String, required: true },
    scopes: { type: [String], default: [] },
    resource: { type: String, default: null },
    accessHash: { type: String, required: true },
    accessExpiresAt: { type: Date, required: true },
    refreshHash: { type: String, required: true },
    refreshExpiresAt: { type: Date, required: true },
    previousRefreshHash: { type: String, default: null },
    /** The code that started this grant (its family): a replay of the code revokes the grant even when it races the exchange. */
    codeHash: { type: String, default: null },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: String },
  },
  { timestamps: true },
)
OAuthGrantSchema.plugin(tenant)
OAuthGrantSchema.index({ accessHash: 1 }, { unique: true })
OAuthGrantSchema.index({ refreshHash: 1 }, { unique: true })
OAuthGrantSchema.index({ previousRefreshHash: 1 }, { sparse: true })
OAuthGrantSchema.index({ codeHash: 1 }, { sparse: true })
OAuthGrantSchema.index({ orgId: 1, revokedAt: 1, createdAt: -1 })
// Password reset and "sign out everywhere" revoke a user's grants across workspaces: updateMany({ userId, revokedAt: null }).
OAuthGrantSchema.index({ userId: 1, revokedAt: 1 })

export const OAuthGrant = defineModel('OAuthGrant', OAuthGrantSchema)
