import { describe, expect, it } from 'vitest'
import { clearMemoryRateLimit, memoryRateLimit } from './rate-limit-memory'

const LIMIT = 5
const WINDOW = 15 * 60_000

describe('in-memory rate limit', () => {
  it('refuses the attempt after the limit with the seconds left', () => {
    const key = `user-${Math.random()}`
    for (let i = 0; i < LIMIT; i += 1) expect(memoryRateLimit(key, LIMIT, WINDOW).ok).toBe(true)
    const refused = memoryRateLimit(key, LIMIT, WINDOW)
    expect(refused.ok).toBe(false)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
    expect(memoryRateLimit(`${key}-other`, LIMIT, WINDOW).ok).toBe(true)
  })

  it('keeps a limited key refused after a flood of other keys', () => {
    const key = `victim-${Math.random()}`
    for (let i = 0; i < LIMIT; i += 1) memoryRateLimit(key, LIMIT, WINDOW)
    for (let i = 0; i < 12_000; i += 1) memoryRateLimit(`flood-${i}-${Math.random()}`, LIMIT, WINDOW)
    expect(memoryRateLimit(key, LIMIT, WINDOW).ok).toBe(false)
  })

  it('lets a key start over after its attempts are cleared', () => {
    const key = `login:ip:${Math.random()}`
    for (let i = 0; i < LIMIT; i += 1) expect(memoryRateLimit(key, LIMIT, WINDOW).ok).toBe(true)
    expect(memoryRateLimit(key, LIMIT, WINDOW).ok).toBe(false)
    clearMemoryRateLimit(key)
    expect(memoryRateLimit(key, LIMIT, WINDOW).ok).toBe(true)
  })
})
