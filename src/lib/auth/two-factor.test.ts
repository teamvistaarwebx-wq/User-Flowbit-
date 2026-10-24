import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, totp, TOTP_STEP_SECONDS, totpStep } from '@/lib/console/totp'
import { parseEncryptionKey, sealSecret } from '@/lib/secret-box'
import { decodePending, deviceRemembered, encodeDevice, encodePending, mustEnrolTwoFactor, PENDING_TTL_SECONDS, REMEMBER_DEVICE_SECONDS, resetRefusal } from './two-factor-core'

vi.mock('server-only', () => ({}))
const APP_SECRET = 's'.repeat(48)
const KEY_HEX = 'a'.repeat(64)
vi.mock('@/lib/env', () => ({ serverEnv: () => ({ APP_SECRET }), encryptionKey: () => parseEncryptionKey(KEY_HEX), secureCookies: () => false }))

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: (n: string, v: string) => jar.set(n, v), delete: (n: string) => jar.delete(n) }),
}))
const createSession = vi.fn()
vi.mock('./session', () => ({ createSession: (...a: unknown[]) => createSession(...a) }))

type Doc = { _id: string; twoFactor: { enabledAt?: Date; secretSealed?: string; lastStep?: number | null; recoveryCodeHashes?: string[]; deviceEpoch?: number } }
const db: { user: Doc | null } = { user: null }
/** A tiny stand-in for the two conditional updates checkSecondFactor makes. */
vi.mock('@/models/User', () => ({
  User: {
    findById: () => ({ lean: async () => (db.user ? structuredClone(db.user) : null) }),
    updateOne: async (filter: Record<string, unknown>, update: { $set?: Record<string, number>; $pull?: Record<string, string> }) => {
      const tf = db.user!.twoFactor
      if (update.$set?.['twoFactor.lastStep'] != null) {
        const step = update.$set['twoFactor.lastStep']
        if (tf.lastStep != null && tf.lastStep >= step) return { modifiedCount: 0 }
        db.user = { ...db.user!, twoFactor: { ...tf, lastStep: step } }
        return { modifiedCount: 1 }
      }
      const hash = filter['twoFactor.recoveryCodeHashes'] as string
      if (!tf.recoveryCodeHashes?.includes(hash)) return { modifiedCount: 0 }
      db.user = { ...db.user!, twoFactor: { ...tf, recoveryCodeHashes: tf.recoveryCodeHashes.filter((h) => h !== hash) } }
      return { modifiedCount: 1 }
    },
  },
}))

const NOW = new Date('2026-10-09T10:00:00Z')

describe('pending sign-in cookie', () => {
  it('round-trips, expires after 10 minutes and refuses a forged or foreign value', () => {
    const raw = encodePending({ u: 'u1', next: '/app/work', invite: 'inv' }, APP_SECRET, NOW)
    expect(decodePending(raw, APP_SECRET, NOW)).toMatchObject({ u: 'u1', next: '/app/work', invite: 'inv' })
    expect(decodePending(raw, APP_SECRET, new Date(NOW.getTime() + (PENDING_TTL_SECONDS + 1) * 1000))).toBeNull()
    expect(decodePending(raw, 'other-secret', NOW)).toBeNull()
    const [body, sig] = raw.split('.')
    const forged = Buffer.from(JSON.stringify({ u: 'admin', x: 9e9 })).toString('base64url')
    expect(decodePending(`${forged}.${sig}`, APP_SECRET, NOW)).toBeNull()
    expect(decodePending(`${body}.${sig}.x`, APP_SECRET, NOW)).toBeNull()
    expect(decodePending(undefined, APP_SECRET, NOW)).toBeNull()
  })

  it('is not interchangeable with a remember-device cookie', () => {
    const device = encodeDevice('u1', 0, APP_SECRET, NOW)
    expect(decodePending(device, APP_SECRET, NOW)).toBeNull()
  })
})

describe('remember this device', () => {
  it('lasts 30 days for the same user and epoch only', () => {
    const raw = encodeDevice('u1', 2, APP_SECRET, NOW)
    expect(deviceRemembered(raw, 'u1', 2, APP_SECRET, NOW)).toBe(true)
    expect(deviceRemembered(raw, 'u2', 2, APP_SECRET, NOW)).toBe(false)
    // A reset or turning 2FA off bumps the epoch: every remembered device is forgotten.
    expect(deviceRemembered(raw, 'u1', 3, APP_SECRET, NOW)).toBe(false)
    expect(deviceRemembered(raw, 'u1', 2, APP_SECRET, new Date(NOW.getTime() + (REMEMBER_DEVICE_SECONDS + 1) * 1000))).toBe(false)
    expect(deviceRemembered(raw, 'u1', 2, 'wrong', NOW)).toBe(false)
  })
})

describe('who must enrol', () => {
  it('only owners and admins of a workspace that requires it, without 2FA', () => {
    expect(mustEnrolTwoFactor({ required: true, role: 'owner', state: null })).toBe(true)
    expect(mustEnrolTwoFactor({ required: true, role: 'admin', state: {} })).toBe(true)
    expect(mustEnrolTwoFactor({ required: true, role: 'admin', state: { enabledAt: NOW } })).toBe(false)
    expect(mustEnrolTwoFactor({ required: true, role: 'member', state: null })).toBe(false)
    expect(mustEnrolTwoFactor({ required: false, role: 'owner', state: null })).toBe(false)
  })
})

describe('admin reset', () => {
  it('never your own, only the owner resets the owner, and only when it is on', () => {
    expect(resetRefusal({ actorIsOwner: false, targetRole: 'member', isSelf: true, enabled: true })).toMatch(/your own/)
    expect(resetRefusal({ actorIsOwner: false, targetRole: 'owner', isSelf: false, enabled: true })).toMatch(/Only the owner/)
    expect(resetRefusal({ actorIsOwner: true, targetRole: 'owner', isSelf: false, enabled: true })).toBeNull()
    expect(resetRefusal({ actorIsOwner: false, targetRole: 'member', isSelf: false, enabled: false })).toMatch(/not on/)
    expect(resetRefusal({ actorIsOwner: false, targetRole: 'admin', isSelf: false, enabled: true })).toBeNull()
    // 2FA is per person: a workspace cannot switch it off for a person who also belongs to other workspaces.
    expect(resetRefusal({ actorIsOwner: true, targetRole: 'member', isSelf: false, enabled: true, otherWorkspaces: 1 })).toMatch(/another Flowbit workspace/)
    expect(resetRefusal({ actorIsOwner: true, targetRole: 'member', isSelf: false, enabled: true, otherWorkspaces: 0 })).toBeNull()
  })
})

describe('second factor (enrolled user)', () => {
  const secret = generateTotpSecret()
  const codes = generateRecoveryCodes()
  beforeEach(() => {
    db.user = { _id: 'u1', twoFactor: { enabledAt: NOW, secretSealed: sealSecret(secret, parseEncryptionKey(KEY_HEX)!), lastStep: null, recoveryCodeHashes: codes.map(hashRecoveryCode), deviceEpoch: 0 } }
    jar.clear()
    createSession.mockReset()
  })

  it('accepts the current code once, then refuses a replay', async () => {
    const { checkSecondFactor } = await import('./two-factor')
    const code = totp(secret)
    await expect(checkSecondFactor('u1', code)).resolves.toEqual({ ok: true, recoveryLeft: null })
    expect(db.user!.twoFactor.lastStep).toBe(totpStep(new Date()))
    const again = await checkSecondFactor('u1', code)
    expect(again.ok).toBe(false)
  })

  it('refuses a wrong or stale code', async () => {
    const { checkSecondFactor } = await import('./two-factor')
    const stale = totp(secret, new Date(Date.now() - 5 * TOTP_STEP_SECONDS * 1000))
    await expect(checkSecondFactor('u1', stale)).resolves.toMatchObject({ ok: false })
    await expect(checkSecondFactor('u1', '000000x')).resolves.toMatchObject({ ok: false })
  })

  it('uses each recovery code once and counts what is left', async () => {
    const { checkSecondFactor } = await import('./two-factor')
    await expect(checkSecondFactor('u1', codes[3].toUpperCase())).resolves.toEqual({ ok: true, recoveryLeft: 9 })
    await expect(checkSecondFactor('u1', codes[3])).resolves.toMatchObject({ ok: false })
    expect(db.user!.twoFactor.recoveryCodeHashes).toHaveLength(9)
  })

  it('a user without 2FA never passes', async () => {
    db.user = { _id: 'u1', twoFactor: {} }
    const { checkSecondFactor } = await import('./two-factor')
    await expect(checkSecondFactor('u1', '123456')).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/not on/) })
  })

  it('startSignIn: no session until the code, a session straight away on a remembered device', async () => {
    const { startSignIn, readPendingSignIn, rememberDevice } = await import('./two-factor')
    const user = { _id: 'u1' as never, twoFactor: { enabledAt: NOW, deviceEpoch: 0 } }
    await expect(startSignIn(user, { next: '/app/folio' })).resolves.toBe(false)
    expect(createSession).not.toHaveBeenCalled()
    await expect(readPendingSignIn()).resolves.toMatchObject({ u: 'u1', next: '/app/folio' })
    await rememberDevice('u1', 0)
    await expect(startSignIn(user)).resolves.toBe(true)
    expect(createSession).toHaveBeenCalledTimes(1)
    // After an admin reset (epoch 1) the same cookie no longer skips the code.
    await expect(startSignIn({ ...user, twoFactor: { enabledAt: NOW, deviceEpoch: 1 } })).resolves.toBe(false)
  })

  it('startSignIn without 2FA starts the session', async () => {
    const { startSignIn } = await import('./two-factor')
    await expect(startSignIn({ _id: 'u2' as never })).resolves.toBe(true)
    expect(createSession).toHaveBeenCalledWith('u2', undefined)
  })
})
