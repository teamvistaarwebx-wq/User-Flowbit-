import 'server-only'
import type { Types } from 'mongoose'
import { serverEnv } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { emailLayout, sendMail } from '@/lib/mail'
import { checkOtp, generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_REFUSAL, OTP_TTL_SECONDS } from '@/lib/otp'
import { assertRateLimit } from '@/lib/rate-limit'
import { EmailVerification } from '@/models/EmailVerification'
import { markEmailVerified } from './session'

/**
 * Email OTP at signup (console spec 5.1): a six-digit code to the account's
 * email proves the inbox before the first workspace (and its Free plan) exists.
 */

const HOUR_MS = 3_600_000
/** Codes per user per hour, counted from the stored challenges (survives restarts). */
export const SIGNUP_CODES_PER_HOUR = 5

type Verifiable = { _id: Types.ObjectId; email: string; name: string }

/** Emails a fresh code; earlier unused codes stop working. Throws UserError when over the limit. */
export async function sendSignupCode(user: Verifiable): Promise<void> {
  await assertRateLimit('signupCode', String(user._id))
  const issued = await EmailVerification.countDocuments({ userId: user._id, createdAt: { $gt: new Date(Date.now() - HOUR_MS) } })
  if (issued >= SIGNUP_CODES_PER_HOUR) throw new UserError('We already sent a few codes. Check your inbox and spam folder, or try again in an hour.')
  const code = generateOtp()
  await EmailVerification.updateMany({ userId: user._id, consumedAt: null }, { $set: { consumedAt: new Date() } })
  await EmailVerification.create({ userId: user._id, email: user.email, codeHash: hashOtp(code, serverEnv().APP_SECRET), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) })
  const mail = emailLayout({
    title: 'Your Flowbit verification code',
    paragraphs: [`Hi ${user.name.split(' ')[0]}, use ${code} to verify your email and create your workspace. It lasts 10 minutes.`, 'If you did not sign up for Flowbit, you can ignore this email.'],
  })
  const sent = await sendMail({ to: user.email, subject: `${code} is your Flowbit code`, ...mail, kind: 'signup_otp', entity: 'User', entityId: user._id, secrets: [code] })
  if (!sent.ok) throw new UserError('We could not send the code just now. Try again in a minute.')
}

/** Checks a guess; marks the email verified on success. Returns the refusal message, or null when verified. */
export async function verifySignupCode(user: Verifiable, code: string): Promise<string | null> {
  await assertRateLimit('signupCodeVerify', String(user._id))
  const challenge = await EmailVerification.findOne({ userId: user._id, email: user.email }).sort({ createdAt: -1 }).lean()
  const check = checkOtp(challenge, code, serverEnv().APP_SECRET)
  if (!challenge) return OTP_REFUSAL.missing
  if (check !== 'ok' && check !== 'mismatch') return OTP_REFUSAL[check]
  // Each guess takes an attempt atomically before it counts, so parallel guesses cannot all slip under the limit.
  const slot = await EmailVerification.updateOne({ _id: challenge._id, consumedAt: null, attempts: { $lt: OTP_MAX_ATTEMPTS } }, { $inc: { attempts: 1 } })
  if (!slot.modifiedCount) return OTP_REFUSAL.too_many
  if (check !== 'ok') return OTP_REFUSAL[check]
  const consumed = await EmailVerification.updateOne({ _id: challenge._id, consumedAt: null }, { $set: { consumedAt: new Date() } })
  if (!consumed.modifiedCount) return OTP_REFUSAL.used
  await markEmailVerified(user._id)
  return null
}
