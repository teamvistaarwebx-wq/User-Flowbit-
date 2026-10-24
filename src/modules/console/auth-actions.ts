'use server'

import { z } from 'zod'
import { fail, ok, publicAction } from '@/lib/actions'
import type { ActionResult } from '@/lib/action-types'
import { hashPassword, passwordSchema, verifyPassword } from '@/lib/auth/password'
import { hashToken } from '@/lib/auth/tokens'
import { completeStaffSession, createStaffSession, destroyStaffSession, getStaffSession, staffIdentity, writeStaffAudit } from '@/lib/console/session'
import { consumeRecoveryCode, generateRecoveryCodes, hashRecoveryCode, verifyTotp } from '@/lib/console/totp'
import { encryptionKey } from '@/lib/env'
import { clearRateLimit, rateLimit, RATE_LIMITS, rateLimitMessage } from '@/lib/rate-limit'
import { requestIp } from '@/lib/request'
import { safeNextPath } from '@/lib/safe-next'
import { openSecret, sealSecret } from '@/lib/secret-box'
import { Staff } from '@/models/console/Staff'
import { StaffSession } from '@/models/console/StaffSession'
import { isStaffRole } from '@/lib/console/roles'

/**
 * Console sign-in (console spec 7.1): password, then a TOTP code (or a
 * recovery code). First sign-in enrols TOTP with a QR code and shows ten
 * recovery codes once. None of this touches the product's `fb_session`.
 */

const HOME = '/console'
const NO_KEY = 'Two-factor sign-in needs APP_ENCRYPTION_KEY on the server. Ask the person who runs Flowbit to set it.'

async function limited(scope: 'consoleLogin' | 'consoleCode', key: string): Promise<string | null> {
  const { limit, windowMs } = RATE_LIMITS[scope]
  const result = await rateLimit(`${scope}:${key}`, limit, windowMs)
  return result.ok ? null : rateLimitMessage(result.retryAfterSeconds)
}

const signInSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter your email'), password: z.string().min(1, 'Enter your password').max(200), next: z.string().optional() })

export const staffSignInAction = publicAction(signInSchema, async (input) => {
  const ip = await requestIp()
  const refused = (await limited('consoleLogin', `ip:${ip}`)) ?? (await limited('consoleLogin', `email:${input.email}`))
  if (refused) return fail(refused)
  const staff = await Staff.findOne({ email: input.email, status: 'active' }).lean()
  // Same answer for an unknown email and a wrong password.
  if (!staff || !isStaffRole(staff.role) || !(await verifyPassword(input.password, staff.passwordHash))) return fail('That email and password do not match a Console account.')
  await clearRateLimit(`consoleLogin:email:${input.email}`)
  await createStaffSession(staff._id)
  const step = staff.totp?.enabledAt ? '/console/login/verify' : '/console/login/enrol'
  const next = safeNextPath(input.next, HOME)
  return ok(undefined, undefined, next === HOME ? step : `${step}?next=${encodeURIComponent(next)}`)
})

/** The session between the password and the code, or a reason to start again. */
async function pendingSession() {
  const state = await getStaffSession()
  if (!state) return { error: 'Your sign-in expired. Enter your email and password again.' } as const
  return { state } as const
}

const codeSchema = z.object({ code: z.string().trim().min(6, 'Enter the 6-digit code').max(20), next: z.string().optional() })

export const verifyStaffCodeAction = publicAction(codeSchema, async ({ code, next }): Promise<ActionResult> => {
  const pending = await pendingSession()
  if ('error' in pending) return fail(pending.error ?? 'Sign in again.')
  const { session, staff } = pending.state
  const refused = await limited('consoleCode', String(staff._id))
  if (refused) return fail(refused)
  const key = encryptionKey()
  if (!key) return fail(NO_KEY)
  const secret = openSecret(staff.totp?.secretSealed, key)
  if (!secret) return fail('Two-factor sign-in is not set up for this account. Ask an Admin to reset it.')
  const step = verifyTotp(secret, code, { lastStep: staff.totp?.lastStep ?? null })
  if (step != null) {
    // Conditional on the stored step so two requests cannot both use the same code.
    const used = await Staff.updateOne({ _id: staff._id, $or: [{ 'totp.lastStep': { $lt: step } }, { 'totp.lastStep': null }] }, { $set: { 'totp.lastStep': step } })
    if (!used.modifiedCount) return fail('That code was already used. Wait for the next one.')
  } else {
    const remaining = consumeRecoveryCode(staff.recoveryCodeHashes ?? [], code)
    if (!remaining) return fail('That code is not right. Check the time on your phone, or use a recovery code.', { code: 'Wrong code' })
    // Pull only if the hash is still there, so two parallel requests cannot both use one code (V2-REVIEW C4).
    const usedHash = hashRecoveryCode(code)
    const pulled = await Staff.updateOne({ _id: staff._id, recoveryCodeHashes: usedHash }, { $pull: { recoveryCodeHashes: usedHash } })
    if (!pulled.modifiedCount) return fail('That recovery code was already used.')
    await writeStaffAudit(staffIdentity(staff), { action: 'console.recovery_code_used', summary: `Signed in with a recovery code (${remaining.length} left)` })
  }
  await clearRateLimit(`consoleCode:${staff._id}`)
  await completeStaffSession(session._id, staff._id)
  return ok('Signed in to the Console.', undefined, safeNextPath(next, HOME))
})

/** Confirms the first code from the authenticator app; returns the recovery codes to show once. */
export const confirmEnrolmentAction = publicAction(z.object({ code: z.string().trim().min(6, 'Enter the 6-digit code').max(10) }), async ({ code }): Promise<ActionResult<{ codes: string[] }>> => {
  const pending = await pendingSession()
  if ('error' in pending) return fail(pending.error ?? 'Sign in again.')
  const { session, staff } = pending.state
  if (staff.totp?.enabledAt) return fail('Two-factor sign-in is already set up. Use your code to sign in.')
  const key = encryptionKey()
  if (!key) return fail(NO_KEY)
  const secret = openSecret(session.pendingTotpSealed, key)
  if (!secret) return fail('Reload the page to get a new QR code.')
  const step = verifyTotp(secret, code)
  if (step == null) return fail('That code is not right. Scan the QR code again and enter the code your app shows now.', { code: 'Wrong code' })
  const codes = generateRecoveryCodes()
  await Staff.updateOne({ _id: staff._id }, { $set: { 'totp.secretSealed': sealSecret(secret, key), 'totp.enabledAt': new Date(), 'totp.lastStep': step, recoveryCodeHashes: codes.map(hashRecoveryCode) } })
  await completeStaffSession(session._id, staff._id)
  await writeStaffAudit(staffIdentity(staff), { action: 'console.totp_enrolled', summary: 'Set up two-factor sign-in' })
  return ok('Two-factor sign-in is on.', { codes })
})

export async function staffSignOutAction(): Promise<ActionResult> {
  await destroyStaffSession()
  return ok('Signed out of the Console.', undefined, '/console/login')
}

const setupSchema = z
  .object({ token: z.string().min(20).max(200), password: passwordSchema, confirm: z.string({ error: 'Repeat the password' }) })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

/** The one-time setup link: choose the Console password (new staff, or an Admin reset). */
export const completeStaffSetupAction = publicAction(setupSchema, async (input) => {
  const ip = await requestIp()
  const refused = await limited('consoleLogin', `setup:${ip}`)
  if (refused) return fail(refused)
  const staff = await Staff.findOneAndUpdate(
    { setupTokenHash: hashToken(input.token), setupExpiresAt: { $gt: new Date() }, status: 'active' },
    { $set: { passwordHash: await hashPassword(input.password) }, $unset: { setupTokenHash: 1, setupExpiresAt: 1 } },
  ).lean()
  if (!staff) return fail('That link has expired or was already used. Ask an Admin for a new one.')
  await StaffSession.deleteMany({ staffId: staff._id })
  return ok('Password saved. Sign in to set up two-factor sign-in.', undefined, '/console/login')
})
