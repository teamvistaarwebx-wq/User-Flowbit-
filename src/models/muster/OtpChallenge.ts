import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A six-digit work-email code for the public claim form. Only the HMAC is stored. */
const OtpChallengeSchema = new Schema(
  {
    ...tenantFields,
    email: { type: String, required: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    /** `claim:<formId>` */
    purpose: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)
OtpChallengeSchema.plugin(tenant)
OtpChallengeSchema.index({ email: 1, purpose: 1, createdAt: -1 })
// Expired challenges disappear an hour after expiry (kept briefly for the hourly throttle).
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 })

export const OtpChallenge = defineModel('OtpChallenge', OtpChallengeSchema)
