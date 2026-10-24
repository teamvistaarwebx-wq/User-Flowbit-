import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * Fixed-window attempt counters shared by every server instance (sign-in,
 * signup, reset, invite, password change, contact form, claim OTP).
 * `_id` is `<key>@<window start ms>`; MongoDB deletes a window once it ends.
 */
const RateLimitSchema = new Schema(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true, index: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
)

RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const RateLimit = defineModel('RateLimit', RateLimitSchema)
