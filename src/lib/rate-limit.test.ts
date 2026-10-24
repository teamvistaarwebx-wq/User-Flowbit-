import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ counts: new Map<string, number>(), down: false }))

// The shared counter, simulated: one count per key (the real one also splits by window).
vi.mock('./rate-limit-store', () => ({
  countAttempt: vi.fn(async (key: string, limit: number) => {
    if (store.down) throw new Error('db down')
    const count = (store.counts.get(key) ?? 0) + 1
    store.counts.set(key, count)
    return count > limit ? { ok: false, retryAfterSeconds: 120 } : { ok: true, retryAfterSeconds: 0 }
  }),
  clearAttempts: vi.fn(async (key: string) => {
    store.counts.delete(key)
  }),
}))

const { assertRateLimit, clearRateLimit, RATE_LIMITS, rateLimit, rateLimitMessage } = await import('./rate-limit')
const { clearMemoryRateLimit } = await import('./rate-limit-memory')

beforeEach(() => {
  store.down = false
})

describe('shared rate limit', () => {
  it('refuses with the minutes message once over the limit', async () => {
    const key = `user-${Math.random()}`
    for (let i = 0; i < RATE_LIMITS.passwordChange.limit; i += 1) await assertRateLimit('passwordChange', key)
    await expect(assertRateLimit('passwordChange', key)).rejects.toThrow(/Too many attempts\. Try again in \d+ minutes?\./)
    await expect(assertRateLimit('passwordChange', `${key}-other`)).resolves.toBeUndefined()
  })

  it('holds the limit across instances: the stored count refuses even when this instance has seen nothing', async () => {
    const key = `login:ip:${Math.random()}`
    const { limit, windowMs } = RATE_LIMITS.login
    store.counts.set(key, limit)
    const result = await rateLimit(key, limit, windowMs)
    expect(result).toEqual({ ok: false, retryAfterSeconds: 120 })
  })

  it('falls back to the in-memory answer when MongoDB is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    store.down = true
    const key = `contact:${Math.random()}`
    const { limit, windowMs } = RATE_LIMITS.contact
    for (let i = 0; i < limit; i += 1) expect((await rateLimit(key, limit, windowMs)).ok).toBe(true)
    expect((await rateLimit(key, limit, windowMs)).ok).toBe(false)
  })

  it('clears both layers', async () => {
    const key = `login:ip:${Math.random()}`
    const { limit, windowMs } = RATE_LIMITS.login
    for (let i = 0; i < limit; i += 1) await rateLimit(key, limit, windowMs)
    expect((await rateLimit(key, limit, windowMs)).ok).toBe(false)
    await clearRateLimit(key)
    expect(store.counts.has(key)).toBe(false)
    expect((await rateLimit(key, limit, windowMs)).ok).toBe(true)
    clearMemoryRateLimit(key)
  })

  it('rounds the wait up to whole minutes', () => {
    expect(rateLimitMessage(30)).toBe('Too many attempts. Try again in 1 minute.')
    expect(rateLimitMessage(601)).toBe('Too many attempts. Try again in 11 minutes.')
  })
})
