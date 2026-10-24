import { createHmac, timingSafeEqual } from 'node:crypto'
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, generateOtp, hashOtp, verifyOtpHash } from '@/lib/otp'

export { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, generateOtp, hashOtp, verifyOtpHash }

/**
 * Work-email verification for the public claim form (pure Node crypto; the
 * secret is passed in). Codes are stored only as an HMAC; the session cookie is
 * base64url(JSON).HMAC, compared in constant time.
 */

export const CLAIM_COOKIE = 'fb_claim'
export const CLAIM_SESSION_TTL_SECONDS = 60 * 60
/** At most this many codes per email per form per hour. */
export const OTP_HOURLY_LIMIT = 5

export type ClaimSession = { orgId: string; employeeId: string; formId: string; email: string; exp: number }

export function signClaimSession(session: Omit<ClaimSession, 'exp'>, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...session, exp: now + CLAIM_SESSION_TTL_SECONDS * 1000 })).toString('base64url')
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function readClaimSession(token: string | undefined, secret: string, now = Date.now()): ClaimSession | null {
  const [body, signature, extra] = (token ?? '').split('.')
  if (!body || !signature || extra !== undefined) return null
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('base64url'))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as ClaimSession
    if (!payload.exp || payload.exp < now || !payload.orgId || !payload.employeeId || !payload.formId) return null
    return payload
  } catch {
    return null
  }
}
