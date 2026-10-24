import { describe, expect, it } from 'vitest'
import { isCronAuthorised } from './cron-auth'

describe('cron authorisation', () => {
  const secret = 'f3b1c2d4e5f60718293a4b5c6d7e8f90'

  it('accepts the bearer token Vercel Cron sends', () => {
    expect(isCronAuthorised(`Bearer ${secret}`, secret)).toBe(true)
    expect(isCronAuthorised(`bearer ${secret}`, secret)).toBe(true)
  })

  it('refuses a wrong, missing or partial token', () => {
    expect(isCronAuthorised('Bearer nope', secret)).toBe(false)
    expect(isCronAuthorised(null, secret)).toBe(false)
    expect(isCronAuthorised(`Bearer ${secret.slice(0, -1)}`, secret)).toBe(false)
  })

  it('refuses everything while CRON_SECRET is unset', () => {
    expect(isCronAuthorised('Bearer ', '')).toBe(false)
    expect(isCronAuthorised(null, '')).toBe(false)
  })
})
