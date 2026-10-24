import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

const PasswordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true },
)

export const PasswordReset = defineModel('PasswordReset', PasswordResetSchema)
