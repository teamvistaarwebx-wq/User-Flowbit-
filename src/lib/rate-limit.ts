import { UserError } from '@/lib/errors'
import { clearMemoryRateLimit, memoryPeek, memoryRateLimit, type RateLimitResult } from './rate-limit-memory'
import { clearAttempts, countAttempt, peekAttempts } from './rate-limit-store'

/**
 * Limits for sign-in, signup, reset, invite acceptance, password change, the
 * contact form and claim OTPs. Two layers: the in-memory sliding window of
 * this process refuses floods without a database call, then a fixed-window
 * counter in MongoDB (collection `ratelimits`) holds the limit across every
 * serverless instance. If MongoDB cannot be reached, the in-memory answer stands.
 */
const MINUTE = 60_000

export type { RateLimitResult } from './rate-limit-memory'

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const local = memoryRateLimit(key, limit, windowMs)
  if (!local.ok) return local
  try {
    return await countAttempt(key, limit, windowMs)
  } catch (error) {
    console.error('[rate-limit] shared counter unavailable, using this instance only', key.split(':')[0], error)
    return local
  }
}

/** Whether `key` is already over its limit, without counting an attempt (a gate in front of expensive work). */
export async function isRateLimited(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const local = memoryPeek(key, limit, windowMs)
  if (!local.ok) return local
  try {
    return await peekAttempts(key, limit, windowMs)
  } catch (error) {
    console.error('[rate-limit] shared counter unavailable, using this instance only', key.split(':')[0], error)
    return local
  }
}

/** Forgets every attempt counted for `key` (a correct password ends the brute-force window). */
export async function clearRateLimit(key: string): Promise<void> {
  clearMemoryRateLimit(key)
  await clearAttempts(key).catch((error) => console.error('[rate-limit] clear failed', key.split(':')[0], error))
}

/** Shared limits so every flow refuses the same way. Key them by IP and/or user/email. */
export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * MINUTE },
  /** Per account across all IPs, so rotating addresses does not buy more password guesses. */
  loginAccount: { limit: 30, windowMs: 15 * MINUTE },
  signup: { limit: 10, windowMs: 15 * MINUTE },
  forgotPassword: { limit: 3, windowMs: 15 * MINUTE },
  resetPassword: { limit: 5, windowMs: 15 * MINUTE },
  inviteAccept: { limit: 10, windowMs: 15 * MINUTE },
  passwordChange: { limit: 5, windowMs: 15 * MINUTE },
  contact: { limit: 5, windowMs: 60 * MINUTE },
  /** Signup email codes sent, per user. */
  signupCode: { limit: 5, windowMs: 60 * MINUTE },
  /** Signup code guesses, per user (each code also allows only 5). */
  signupCodeVerify: { limit: 15, windowMs: 60 * MINUTE },
  /** Workspaces one user may create (each starts a Free plan or a trial). */
  workspaceCreate: { limit: 3, windowMs: 24 * 60 * MINUTE },
  /** Public document page actions (accept, decline, "I've paid"), per IP and per link. */
  publicDoc: { limit: 10, windowMs: 15 * MINUTE },
  publicDocLink: { limit: 5, windowMs: 60 * MINUTE },
  /** Approve / Reject from an emailed link, per IP and per link. */
  actionLink: { limit: 20, windowMs: 15 * MINUTE },
  actionLinkToken: { limit: 10, windowMs: 60 * MINUTE },
  /** Public website lead forms, per IP and per form. */
  leadForm: { limit: 10, windowMs: 15 * MINUTE },
  leadFormKey: { limit: 300, windowMs: 60 * MINUTE },
  /** Generic lead webhooks (Zapier, Meta lead ads, JustDial), per hook. */
  leadHook: { limit: 600, windowMs: 60 * MINUTE },
  /** Payslip link codes and guesses, per IP. */
  payslipLink: { limit: 20, windowMs: 15 * MINUTE },
  /** Console staff password attempts, per IP and per email. */
  consoleLogin: { limit: 5, windowMs: 15 * MINUTE },
  /** Console TOTP or recovery code attempts, per staff member. */
  consoleCode: { limit: 8, windowMs: 15 * MINUTE },
  /** Workspace users' two-factor codes (sign-in, turning it off, new recovery codes), per user. */
  twoFactorCode: { limit: 8, windowMs: 15 * MINUTE },
  /** The same codes, per user per day, so slow guessing under the 15-minute window still stops. */
  twoFactorDaily: { limit: 30, windowMs: 24 * 60 * MINUTE },
  /** Wrong two-factor codes per user per hour before the person is emailed an alert (once per day). */
  twoFactorAlert: { limit: 5, windowMs: 60 * MINUTE },
  /** Bad bearer, refresh, code or client credentials at /mcp, /oauth/token and /oauth/revoke, per IP. */
  badToken: { limit: 30, windowMs: 10 * MINUTE },
  /** Client portal sign-in codes sent, per email and per IP. */
  portalCodeSend: { limit: 5, windowMs: 15 * MINUTE },
  /** Client portal code guesses, per email (each code also allows only 5). */
  portalCodeVerify: { limit: 10, windowMs: 15 * MINUTE },
  /** Office address lookups on Flowbit's Google Geocoding key, per workspace. */
  geocode: { limit: 120, windowMs: 60 * MINUTE },
} as const

export type RateLimitScope = keyof typeof RATE_LIMITS

/** "Too many attempts. Try again in 12 minutes." */
export const rateLimitMessage = (retryAfterSeconds: number) => {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
}

/** Counts one attempt for `scope:key`; throws UserError (action() turns it into { ok: false }) when over the limit. */
export async function assertRateLimit(scope: RateLimitScope, key: string): Promise<void> {
  const { limit, windowMs } = RATE_LIMITS[scope]
  const result = await rateLimit(`${scope}:${key}`, limit, windowMs)
  if (!result.ok) throw new UserError(rateLimitMessage(result.retryAfterSeconds))
}
