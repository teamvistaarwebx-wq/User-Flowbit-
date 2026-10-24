import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Two-factor sign-in for workspace users, the pure part (node:crypto only,
 * the secret is passed in). The TOTP maths and recovery codes are the
 * Console's (lib/console/totp). Here: the short-lived "password done, code
 * next" cookie, the 30-day "remember this device" cookie and who must enrol.
 */

export const PENDING_COOKIE = 'fb_2fa'
export const DEVICE_COOKIE = 'fb_2fa_device'
export const PENDING_TTL_SECONDS = 10 * 60
export const REMEMBER_DEVICE_DAYS = 30
export const REMEMBER_DEVICE_SECONDS = REMEMBER_DEVICE_DAYS * 24 * 60 * 60

/** Roles that must use two-factor sign-in when the workspace requires it for admins. */
export const TWO_FACTOR_ADMIN_ROLES: readonly string[] = ['owner', 'admin']

export type PendingSignIn = Readonly<{
  /** User id. */
  u: string
  /** Workspace to open after the code. */
  o?: string
  next?: string
  invite?: string
  /** Expiry, epoch seconds. */
  x: number
}>

export type RememberedDevice = Readonly<{ u: string; e: number; x: number }>

const mac = (purpose: string, body: string, secret: string) => createHmac('sha256', secret).update(`${purpose}:${body}`).digest('base64url')

function seal(purpose: string, payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${mac(purpose, body, secret)}`
}

function open<T>(purpose: string, raw: string | null | undefined, secret: string): T | null {
  const [body, sig, extra] = (raw ?? '').split('.')
  if (!body || !sig || extra !== undefined) return null
  const expected = Buffer.from(mac(purpose, body, secret))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

const nowSeconds = (now: Date) => Math.floor(now.getTime() / 1000)

export function encodePending(input: Omit<PendingSignIn, 'x'>, secret: string, now: Date = new Date()): string {
  return seal('2fa-pending', { ...input, x: nowSeconds(now) + PENDING_TTL_SECONDS }, secret)
}

/** The pending sign-in, or null when missing, forged or older than 10 minutes. */
export function decodePending(raw: string | null | undefined, secret: string, now: Date = new Date()): PendingSignIn | null {
  const value = open<PendingSignIn>('2fa-pending', raw, secret)
  if (!value || typeof value.u !== 'string' || typeof value.x !== 'number') return null
  return value.x > nowSeconds(now) ? value : null
}

export function encodeDevice(userId: string, epoch: number, secret: string, now: Date = new Date()): string {
  return seal('2fa-device', { u: userId, e: epoch, x: nowSeconds(now) + REMEMBER_DEVICE_SECONDS }, secret)
}

/** True when the cookie remembers this user, was made before the last reset (same epoch) and has not expired. */
export function deviceRemembered(raw: string | null | undefined, userId: string, epoch: number, secret: string, now: Date = new Date()): boolean {
  const value = open<RememberedDevice>('2fa-device', raw, secret)
  return Boolean(value && value.u === userId && value.e === epoch && value.x > nowSeconds(now))
}

export type TwoFactorState = Readonly<{ enabledAt?: Date | null } | null | undefined>

export const twoFactorOn = (state: TwoFactorState): boolean => Boolean(state?.enabledAt)

/** An owner or admin in a workspace that requires two-factor sign-in, without it set up yet. */
export function mustEnrolTwoFactor(input: { required?: boolean | null; role: string; state: TwoFactorState }): boolean {
  return Boolean(input.required) && TWO_FACTOR_ADMIN_ROLES.includes(input.role) && !twoFactorOn(input.state)
}

/** Whether a member's two-factor sign-in may be reset by this admin: never their own, and only the owner resets the owner. */
export function resetRefusal(input: { actorIsOwner: boolean; targetRole: string; isSelf: boolean; enabled: boolean; otherWorkspaces?: number }): string | null {
  if (input.isSelf) return 'Turn off your own two-factor sign-in from Settings → Security.'
  if (input.targetRole === 'owner' && !input.actorIsOwner) return 'Only the owner can reset the owner’s two-factor sign-in.'
  if (!input.enabled) return 'Two-factor sign-in is not on for this person.'
  // 2FA belongs to the person, not the workspace: one workspace must not switch it off for the others.
  if ((input.otherWorkspaces ?? 0) > 0) return 'This person also belongs to another Flowbit workspace, so their two-factor sign-in can only be reset by Flowbit support. Ask them to write to support.'
  return null
}
