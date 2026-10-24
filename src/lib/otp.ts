import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Six-digit email codes (claim form, signup). Pure Node crypto; the secret is
 * passed in. Codes are stored only as an HMAC and compared in constant time.
 */

export const OTP_TTL_SECONDS = 10 * 60
export const OTP_MAX_ATTEMPTS = 5

export const generateOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

export const hashOtp = (code: string, secret: string): string => createHmac('sha256', secret).update(code).digest('hex')

export function verifyOtpHash(code: string, hash: string, secret: string): boolean {
  const expected = Buffer.from(hashOtp(code, secret), 'hex')
  const actual = Buffer.from(hash, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export type OtpChallengeLike = { codeHash: string; attempts: number; expiresAt: Date; consumedAt?: Date | null }
export type OtpCheck = 'ok' | 'missing' | 'used' | 'expired' | 'too_many' | 'mismatch'

/**
 * Judges a guess against the latest challenge, in the order the refusals
 * matter: no code, already used, expired, out of attempts, wrong code.
 * `attempts` is the count before this guess (the caller increments it atomically).
 */
export function checkOtp(challenge: OtpChallengeLike | null | undefined, code: string, secret: string, now = new Date()): OtpCheck {
  if (!challenge) return 'missing'
  if (challenge.consumedAt) return 'used'
  if (challenge.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return 'too_many'
  return verifyOtpHash(code, challenge.codeHash, secret) ? 'ok' : 'mismatch'
}

export const OTP_REFUSAL: Record<Exclude<OtpCheck, 'ok'>, string> = {
  missing: 'Request a code first.',
  used: 'That code was already used. Request a new one.',
  expired: 'That code has expired. Request a new one.',
  too_many: 'Too many attempts. Request a new code.',
  mismatch: 'That code did not match.',
}
