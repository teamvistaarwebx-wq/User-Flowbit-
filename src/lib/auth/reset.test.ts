import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ claim: [] as unknown[], user: [] as unknown[], sessions: [] as unknown[], grants: [] as unknown[], claimResult: null as unknown }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/mail', () => ({ emailLayout: vi.fn(), sendMail: vi.fn() }))
vi.mock('./password', () => ({ hashPassword: async (p: string) => `hash:${p}` }))
vi.mock('@/models/PasswordReset', () => ({
  PasswordReset: { findOneAndUpdate: (filter: unknown, update: unknown) => ({ lean: async () => (calls.claim.push({ filter, update }), calls.claimResult) }) },
}))
vi.mock('@/models/User', () => ({ User: { updateOne: async (filter: unknown, update: unknown) => calls.user.push({ filter, update }) } }))
vi.mock('@/models/Session', () => ({ Session: { deleteMany: async (filter: unknown) => calls.sessions.push(filter) } }))
vi.mock('@/models/mcp/OAuthGrant', () => ({ OAuthGrant: { updateMany: async (filter: unknown, update: unknown) => calls.grants.push({ filter, update }) } }))

const { resetPassword } = await import('./reset')

describe('resetPassword', () => {
  beforeEach(() => {
    calls.claim = []
    calls.user = []
    calls.sessions = []
    calls.grants = []
    calls.claimResult = null
  })

  it('claims the link atomically (unused and unexpired) before changing anything', async () => {
    await expect(resetPassword('used-token', 'new-password-1')).rejects.toThrow(/expired or was already used/)
    const [{ filter, update }] = calls.claim as { filter: Record<string, unknown>; update: { $set: { usedAt: Date } } }[]
    expect(filter.usedAt).toBeNull()
    expect(filter.expiresAt).toHaveProperty('$gt')
    expect(update.$set.usedAt).toBeInstanceOf(Date)
    expect(calls.user).toHaveLength(0)
  })

  it('signs out every session, forgets remembered 2FA devices and revokes connected AI apps', async () => {
    calls.claimResult = { _id: 'r1', userId: 'u1' }
    await resetPassword('good-token', 'new-password-1')
    expect(calls.user).toEqual([{ filter: { _id: 'u1' }, update: { $set: { passwordHash: 'hash:new-password-1' }, $inc: { 'twoFactor.deviceEpoch': 1 } } }])
    expect(calls.sessions).toEqual([{ userId: 'u1' }])
    expect(calls.grants).toHaveLength(1)
    expect(calls.grants[0]).toMatchObject({ filter: { userId: 'u1', revokedAt: null }, update: { $set: { revokedBy: 'password_reset' } } })
  })
})
