import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/** A six-digit signup code (lib/auth/email-verification). Only the HMAC is stored. */
const EmailVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)
EmailVerificationSchema.index({ userId: 1, createdAt: -1 })
// Kept a day past expiry for the hourly send limit, then removed.
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 })

export const EmailVerification = defineModel('EmailVerification', EmailVerificationSchema)
