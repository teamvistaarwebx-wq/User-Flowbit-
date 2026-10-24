import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const KEY = randomBytes(32)
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<typeof import('@/lib/env')>()), encryptionKey: () => KEY }))
const user: { _id: string; email: string; twoFactor: Record<string, unknown> | null } = { _id: 'u1', email: 'asha@vistaar.in', twoFactor: null }
const writes: Record<string, unknown>[] = []
vi.mock('@/models/User', () => ({
  User: {
    findById: () => ({ lean: async () => user }),
    updateOne: async (_f: unknown, u: { $set: Record<string, unknown> }) => {
      writes.push(u.$set)
      user.twoFactor = { ...(user.twoFactor ?? {}), pendingSealed: u.$set['twoFactor.pendingSealed'] }
    },
  },
}))

beforeEach(() => {
  user.twoFactor = null
  writes.length = 0
})

describe('2FA set-up starts on click (browser check 9 Oct)', () => {
  it('the page view makes no secret and writes nothing', async () => {
    const { twoFactorView } = await import('./two-factor-view')
    expect(twoFactorView(user as never)).toEqual({ state: 'off' })
    expect(writes).toEqual([])
    expect(twoFactorView({ ...user, twoFactor: { enabledAt: new Date('2026-10-01'), recoveryCodeHashes: ['a', 'b'] } } as never)).toMatchObject({ state: 'on', recoveryLeft: 2 })
  })

  it('Set up makes the secret once and shows the same QR when pressed again', async () => {
    const { beginEnrolment } = await import('./two-factor-view')
    const generate = vi.fn(() => 'JBSWY3DPEHPK3PXP')
    const first = await beginEnrolment('u1' as never, generate)
    expect(first).toMatchObject({ secret: 'JBSWY3DPEHPK3PXP', qrPath: expect.any(String), qrSize: expect.any(Number) })
    const second = await beginEnrolment('u1' as never, generate)
    expect(second?.secret).toBe(first?.secret)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(writes).toHaveLength(1)
  })

  it('refuses once two-factor is already on', async () => {
    user.twoFactor = { enabledAt: new Date() }
    const { beginEnrolment } = await import('./two-factor-view')
    expect(await beginEnrolment('u1' as never)).toBeNull()
  })
})
