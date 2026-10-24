import 'server-only'
import type { Types } from 'mongoose'
import { emailLayout, sendMail } from '@/lib/mail'
import { UserError } from '@/lib/errors'
import { PasswordReset } from '@/models/PasswordReset'
import { Session } from '@/models/Session'
import { OAuthGrant } from '@/models/mcp/OAuthGrant'
import { User } from '@/models/User'
import { hashPassword } from './password'
import { hashToken, randomToken } from './tokens'

const RESET_MINUTES = 60

/** Emails a reset link when the account exists. Silent otherwise (no account probing). */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() }).lean()
  if (!user) return
  const token = randomToken()
  await PasswordReset.create({ userId: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) })
  const mail = emailLayout({
    title: 'Reset your Flowbit password',
    paragraphs: [`Hi ${user.name.split(' ')[0]}, use the button below to choose a new password.`, `The link works for ${RESET_MINUTES} minutes and only once.`],
    cta: { label: 'Choose a new password', href: `/reset-password/${token}` },
  })
  await sendMail({ to: user.email, subject: 'Reset your Flowbit password', ...mail, kind: 'password_reset', secrets: [token] })
}

export async function findReset(token: string) {
  return PasswordReset.findOne({ tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } }).lean()
}

/** Revokes every connected AI app (MCP grant) of a person: a reset or "sign out everywhere" must not leave one alive. */
export async function revokeUserGrants(userId: Types.ObjectId, by: string): Promise<void> {
  await OAuthGrant.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: by } })
}

/**
 * Sets the new password, burns the token (claimed once, so two parallel uses
 * cannot both succeed), signs out every session, forgets remembered 2FA
 * devices and revokes connected AI apps.
 */
export async function resetPassword(token: string, password: string) {
  const now = new Date()
  const reset = await PasswordReset.findOneAndUpdate({ tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } }, { $set: { usedAt: now } }).lean()
  if (!reset) throw new UserError('This reset link has expired or was already used. Request a new one.')
  await User.updateOne({ _id: reset.userId }, { $set: { passwordHash: await hashPassword(password) }, $inc: { 'twoFactor.deviceEpoch': 1 } })
  await Session.deleteMany({ userId: reset.userId })
  await revokeUserGrants(reset.userId, 'password_reset')
  return reset.userId
}
