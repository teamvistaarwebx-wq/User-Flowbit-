import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { STAFF_ROLES } from '@/lib/console/roles'

/**
 * A Flowbit team member who signs in to the Console (console spec 7.1).
 * Separate from User: staff have their own password, TOTP and session
 * cookie, and a customer account never opens the Console.
 */
const StaffSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: STAFF_ROLES, required: true },
    /** Only the founder may open the Internal workspace (spec 4.1). */
    isFounder: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    passwordHash: { type: String },
    /** One-time link to set the password (new staff, migrated admins without one): sha256 of the token. */
    setupTokenHash: { type: String, index: true, sparse: true },
    setupExpiresAt: { type: Date },
    totp: {
      /** Base32 secret sealed with APP_ENCRYPTION_KEY (lib/secret-box). */
      secretSealed: { type: String },
      enabledAt: { type: Date },
      /** Last accepted time step: a code is never accepted twice. */
      lastStep: { type: Number },
    },
    /** sha256 of each unused recovery code (lib/console/totp). */
    recoveryCodeHashes: { type: [String], default: [] },
    /** The User this staff record came from (migration from isPlatformAdmin), for reference only. */
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    lastLoginAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true },
)

export const Staff = defineModel('Staff', StaffSchema)
