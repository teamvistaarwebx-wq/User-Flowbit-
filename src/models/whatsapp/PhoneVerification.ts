import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/** A WhatsApp OTP sent to prove a profile phone number (HMAC of the code only, lib/otp). */
const PhoneVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    phone: { type: String, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: true },
)
PhoneVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 })

export const PhoneVerification = defineModel('PhoneVerification', PhoneVerificationSchema)
