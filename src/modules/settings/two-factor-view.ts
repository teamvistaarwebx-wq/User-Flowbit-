import 'server-only'
import type { Types } from 'mongoose'
import { generateTotpSecret, otpauthUrl } from '@/lib/console/totp'
import { formatDate } from '@/lib/dates'
import { encryptionKey } from '@/lib/env'
import { openSecret, sealSecret } from '@/lib/secret-box'
import { qrMatrix, qrPath } from '@/lib/upi'
import { User } from '@/models/User'
import type { TwoFactorEnrolment, TwoFactorView } from '@/components/settings/two-factor-card'

type UserState = { _id: Types.ObjectId; email: string; twoFactor?: { enabledAt?: Date | null; pendingSealed?: string | null; recoveryCodeHashes?: string[] | null } | null }

/**
 * What the Security page shows: "on" with the codes left, or "off" with a
 * Set up button. No secret is made on page load: the enrolment QR comes from
 * beginEnrolment, after the person asks for it.
 */
export function twoFactorView(user: UserState): TwoFactorView {
  const state = user.twoFactor
  if (state?.enabledAt) return { state: 'on', enabledOn: formatDate(state.enabledAt), recoveryLeft: state.recoveryCodeHashes?.length ?? 0 }
  return encryptionKey() ? { state: 'off' } : { state: 'unavailable' }
}

/**
 * Starts (or resumes) enrolment: the secret is kept sealed on the user until
 * the first code confirms it. Null when 2FA is already on or no key is set.
 */
export async function beginEnrolment(userId: Types.ObjectId, generate: () => string = generateTotpSecret): Promise<TwoFactorEnrolment | null> {
  const key = encryptionKey()
  if (!key) return null
  const user = await User.findById(userId, { email: 1, twoFactor: 1 }).lean()
  if (!user || user.twoFactor?.enabledAt) return null
  let secret = openSecret(user.twoFactor?.pendingSealed, key)
  if (!secret) {
    secret = generate()
    await User.updateOne({ _id: userId }, { $set: { 'twoFactor.pendingSealed': sealSecret(secret, key) } })
  }
  const matrix = qrMatrix(otpauthUrl({ secret, account: user.email, issuer: 'Flowbit' }))
  return { qrPath: qrPath(matrix), qrSize: matrix.length + 4, secret }
}
