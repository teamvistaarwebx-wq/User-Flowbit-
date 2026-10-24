import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const store = vi.hoisted(() => ({ counts: new Map<string, number>() }))
vi.mock('@/lib/rate-limit-store', () => ({
  countAttempt: vi.fn(async (key: string, limit: number) => {
    const count = (store.counts.get(key) ?? 0) + 1
    store.counts.set(key, count)
    return count > limit ? { ok: false, retryAfterSeconds: 600 } : { ok: true, retryAfterSeconds: 0 }
  }),
  peekAttempts: vi.fn(),
  clearAttempts: vi.fn(async () => undefined),
}))
vi.mock('@/lib/mail', () => ({ sendMail: vi.fn(), emailLayout: (o: { title: string; paragraphs: string[] }) => ({ html: o.title, text: o.paragraphs.join('\n') }) }))
vi.mock('@/models/User', () => ({ User: { findById: () => ({ lean: async () => ({ name: 'Asha', email: 'asha@vistaar.in' }) }) } }))

const { noteWrongTwoFactorCode, twoFactorCodeLimit } = await import('./two-factor-alert')
const { clearMemoryRateLimit } = await import('@/lib/rate-limit-memory')
const { RATE_LIMITS } = await import('@/lib/rate-limit')

const reset = (userId: string) => {
  store.counts.clear()
  for (const k of ['twoFactorCode', 'twoFactorDaily', 'twoFactorFail', 'twoFactorAlertSent']) clearMemoryRateLimit(`${k}:${userId}`)
}

describe('two-factor daily cap and alert (L8)', () => {
  beforeEach(() => reset('u1'))

  it('refuses after the daily cap even when the 15-minute window keeps resetting', async () => {
    for (let i = 0; i < RATE_LIMITS.twoFactorDaily.limit; i += 1) {
      // A new 15-minute window each time: only the daily counter carries over.
      clearMemoryRateLimit('twoFactorCode:u1')
      store.counts.delete('twoFactorCode:u1')
      expect(await twoFactorCodeLimit('u1')).toBeNull()
    }
    clearMemoryRateLimit('twoFactorCode:u1')
    store.counts.delete('twoFactorCode:u1')
    expect(await twoFactorCodeLimit('u1')).toMatch(/today/)
  })

  it('still applies the 15-minute limit first', async () => {
    for (let i = 0; i < RATE_LIMITS.twoFactorCode.limit; i += 1) expect(await twoFactorCodeLimit('u1')).toBeNull()
    expect(await twoFactorCodeLimit('u1')).toMatch(/Too many attempts/)
  })

  it('emails the person once when wrong codes pile up, and not again that day', async () => {
    const send = vi.fn(async () => ({}) as never)
    const sent: boolean[] = []
    for (let i = 0; i < RATE_LIMITS.twoFactorAlert.limit + 3; i += 1) sent.push(await noteWrongTwoFactorCode('u1', send))
    expect(sent.filter(Boolean)).toHaveLength(1)
    expect(sent.indexOf(true)).toBe(RATE_LIMITS.twoFactorAlert.limit - 1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]).toMatchObject([{ to: 'asha@vistaar.in', kind: 'security', subject: expect.stringMatching(/two-factor/) }])
  })
})
