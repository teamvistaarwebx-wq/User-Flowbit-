import { describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ counts: new Map<string, number>() }))

// The shared counter, simulated in memory (one window per key).
vi.mock('./rate-limit-store', () => ({
  countAttempt: vi.fn(async (key: string, limit: number) => {
    const count = (store.counts.get(key) ?? 0) + 1
    store.counts.set(key, count)
    return count > limit ? { ok: false, retryAfterSeconds: 300 } : { ok: true, retryAfterSeconds: 0 }
  }),
  peekAttempts: vi.fn(async (key: string, limit: number) => ((store.counts.get(key) ?? 0) > limit ? { ok: false, retryAfterSeconds: 300 } : { ok: true, retryAfterSeconds: 0 })),
  clearAttempts: vi.fn(async () => undefined),
}))

const { badTokenGate, noteBadToken } = await import('./bad-token-limit')
const { RATE_LIMITS } = await import('./rate-limit')
const { isBadCredential, revoke } = await import('@/modules/mcp/oauth/core')
const { memoryOAuthStore } = await import('@/modules/mcp/oauth/memory-store')

describe('per-IP bad-token limit (L7)', () => {
  it('lets an IP through until it has sent too many bad tokens, then refuses it before any lookup', async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200)}`
    expect(await badTokenGate(ip)).toBeNull()
    for (let i = 0; i < RATE_LIMITS.badToken.limit; i += 1) await noteBadToken(ip)
    expect(await badTokenGate(ip)).toMatchObject({ ok: false, retryAfterSeconds: expect.any(Number) })
    expect(await badTokenGate('198.51.100.7')).toBeNull()
  })

  it('peeking never counts an attempt', async () => {
    const ip = '192.0.2.44'
    for (let i = 0; i < 100; i += 1) await badTokenGate(ip)
    expect(store.counts.get(`badToken:${ip}`)).toBeUndefined()
  })

  it('counts only bad credentials at the token endpoint, and unknown tokens at revoke', async () => {
    expect(isBadCredential('invalid_grant')).toBe(true)
    expect(isBadCredential('invalid_client')).toBe(true)
    expect(isBadCredential('invalid_request')).toBe(false)
    expect(isBadCredential('unsupported_grant_type')).toBe(false)
    expect(await revoke(memoryOAuthStore(), 'fba_unknown', null)).toBe(false)
    expect(await revoke(memoryOAuthStore(), undefined, null)).toBe(false)
  })
})
