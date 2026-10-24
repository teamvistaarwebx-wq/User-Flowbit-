import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

const SessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    activeOrgId: { type: Schema.Types.ObjectId, ref: 'Org' },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: '' },
    /** Updated with the sliding expiry, at most every 5 minutes ("last active"). createdAt = signed in. */
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
)

// MongoDB removes expired sessions on its own.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
// Platform "last active" per workspace.
SessionSchema.index({ activeOrgId: 1, lastSeenAt: -1 })

export const Session = defineModel('Session', SessionSchema)
