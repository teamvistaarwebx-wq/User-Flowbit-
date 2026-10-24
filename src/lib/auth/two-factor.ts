import 'server-only'
import { cookies } from 'next/headers'
import type { Types } from 'mongoose'
import { consumeRecoveryCode, hashRecoveryCode, verifyTotp } from '@/lib/console/totp'
import { encryptionKey, secureCookies, serverEnv } from '@/lib/env'
import { openSecret } from '@/lib/secret-box'
import { User } from '@/models/User'
import { createSession } from './session'
import { decodePending, deviceRemembered, DEVICE_COOKIE, encodeDevice, encodePending, PENDING_COOKIE, PENDING_TTL_SECONDS, REMEMBER_DEVICE_SECONDS, twoFactorOn, type PendingSignIn } from './two-factor-core'

/**
 * Two-factor sign-in, the server part. Every sign-in that proved the first
 * factor (password, Google, a reset link) calls `startSignIn`: without 2FA,
 * or on a remembered device, the session starts; otherwise a 10-minute signed
 * cookie carries the person to /login/2fa and no session exists until the code.
 */

export const TWO_FACTOR_PATH = '/login/2fa'

type SignInUser = { _id: Types.ObjectId; twoFactor?: { enabledAt?: Date | null; deviceEpoch?: number | null } | null }
type StartOptions = { activeOrgId?: Types.ObjectId | null; next?: string; invite?: string }

const cookieBase = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: secureCookies(), path: '/' })
const secret = () => serverEnv().APP_SECRET

/** True when the session started now; false when the code page comes next. */
export async function startSignIn(user: SignInUser, opts: StartOptions = {}): Promise<boolean> {
  const jar = await cookies()
  if (twoFactorOn(user.twoFactor) && !deviceRemembered(jar.get(DEVICE_COOKIE)?.value, String(user._id), user.twoFactor?.deviceEpoch ?? 0, secret())) {
    const pending = encodePending({ u: String(user._id), o: opts.activeOrgId ? String(opts.activeOrgId) : undefined, next: opts.next, invite: opts.invite }, secret())
    jar.set(PENDING_COOKIE, pending, { ...cookieBase(), maxAge: PENDING_TTL_SECONDS })
    return false
  }
  await createSession(user._id, opts.activeOrgId)
  return true
}

export async function readPendingSignIn(): Promise<PendingSignIn | null> {
  return decodePending((await cookies()).get(PENDING_COOKIE)?.value, secret())
}

export async function clearPendingSignIn(): Promise<void> {
  ;(await cookies()).delete(PENDING_COOKIE)
}

export async function rememberDevice(userId: Types.ObjectId | string, epoch: number): Promise<void> {
  ;(await cookies()).set(DEVICE_COOKIE, encodeDevice(String(userId), epoch, secret()), { ...cookieBase(), maxAge: REMEMBER_DEVICE_SECONDS })
}

export type SecondFactor = { ok: true; recoveryLeft: number | null } | { ok: false; error: string }

const NO_KEY = 'Two-factor sign-in needs APP_ENCRYPTION_KEY on the server. Ask the person who runs Flowbit to set it.'

/**
 * Checks a 6-digit code or a recovery code for a user with 2FA on. Each is
 * used once: the TOTP step and the recovery hash are claimed with a
 * conditional update, so two parallel requests cannot both pass.
 */
export async function checkSecondFactor(userId: Types.ObjectId | string, code: string): Promise<SecondFactor> {
  const user = await User.findById(userId, { twoFactor: 1 }).lean()
  const state = user?.twoFactor
  if (!state?.enabledAt) return { ok: false, error: 'Two-factor sign-in is not on for this account.' }
  const key = encryptionKey()
  if (!key) return { ok: false, error: NO_KEY }
  const plain = openSecret(state.secretSealed, key)
  if (!plain) return { ok: false, error: 'Two-factor sign-in could not be read. Ask a workspace admin to reset it.' }
  const step = verifyTotp(plain, code, { lastStep: state.lastStep ?? null })
  if (step != null) {
    const used = await User.updateOne({ _id: userId, $or: [{ 'twoFactor.lastStep': { $lt: step } }, { 'twoFactor.lastStep': null }] }, { $set: { 'twoFactor.lastStep': step } })
    return used.modifiedCount ? { ok: true, recoveryLeft: null } : { ok: false, error: 'That code was already used. Wait for the next one.' }
  }
  const remaining = consumeRecoveryCode(state.recoveryCodeHashes ?? [], code)
  if (!remaining) return { ok: false, error: 'That code is not right. Check the time on your phone, or use a recovery code.' }
  const hash = hashRecoveryCode(code)
  const pulled = await User.updateOne({ _id: userId, 'twoFactor.recoveryCodeHashes': hash }, { $pull: { 'twoFactor.recoveryCodeHashes': hash } })
  return pulled.modifiedCount ? { ok: true, recoveryLeft: remaining.length } : { ok: false, error: 'That recovery code was already used.' }
}
