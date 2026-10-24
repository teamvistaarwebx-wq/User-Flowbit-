import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * A Console sign-in (cookie lib/console/cookies). `stage` is 'mfa' after the
 * password and before the TOTP or recovery code, 'full' after it. An
 * enrolment in progress keeps its sealed secret here until confirmed.
 */
const StaffSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    stage: { type: String, enum: ['mfa', 'full'], required: true },
    pendingTotpSealed: { type: String },
    expiresAt: { type: Date, required: true },
    ip: { type: String },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
)
StaffSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const StaffSession = defineModel('StaffSession', StaffSessionSchema)
