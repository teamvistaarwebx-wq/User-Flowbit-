import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

export const MOTION_PREFS = ['system', 'reduce', 'full'] as const
export const TEAM_VIEWS = ['cards', 'list'] as const
export type TeamView = (typeof TEAM_VIEWS)[number]

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String, index: true, sparse: true },
    avatarFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    phone: { type: String },
    /** WhatsApp A (console spec 10): the E.164 number proved by an OTP, and the person's opt-in. */
    phoneVerifiedAt: { type: Date },
    whatsapp: {
      optedInAt: { type: Date },
      /** STOP or the toggle: nothing goes to this number on WhatsApp. */
      optedOutAt: { type: Date },
      noticeVersion: { type: String },
    },
    /** Set when the person proved they read this inbox: signup code, Google, a reset or invite link. */
    emailVerifiedAt: { type: Date },
    prefs: {
      sound: { type: Boolean, default: true },
      /** Legacy boolean, kept in sync with `motion` ('reduce' -> true). */
      reducedMotion: { type: Boolean, default: false },
      /** Settings -> Appearance: follow the OS, always reduce, or always animate. */
      motion: { type: String, enum: MOTION_PREFS, default: 'system' },
      /** Teams → members: cards or a sortable list, remembered per person. */
      teamView: { type: String, enum: TEAM_VIEWS, default: 'cards' },
      /** Product tours this person has finished or skipped (modules/activation/tours), e.g. ['work', 'muster']. */
      toursSeen: { type: [String], default: [] },
      /** Language of the employee self-service pages (lib/i18n): 'en' or 'hi'. */
      locale: { type: String, enum: ['en', 'hi'], default: 'en' },
    },
    /**
     * Two-factor sign-in (lib/auth/two-factor): the TOTP secret sealed with secret-box, the last used
     * step (a code works once), sha256 recovery codes and `deviceEpoch` (bumped on reset or disable,
     * so every "remember this device" cookie stops working). `pendingSealed` holds the secret being enrolled.
     */
    twoFactor: {
      type: new Schema(
        {
          secretSealed: String,
          pendingSealed: String,
          enabledAt: Date,
          lastStep: Number,
          recoveryCodeHashes: { type: [String], default: undefined },
          deviceEpoch: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: undefined,
    },
    lastLoginAt: { type: Date },
    lastOrgId: { type: Schema.Types.ObjectId, ref: 'Org' },
  },
  { timestamps: true },
)

export const User = defineModel('User', UserSchema)
