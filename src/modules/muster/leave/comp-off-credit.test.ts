import { describe, expect, it } from 'vitest'
import { compOffEarned } from './comp-off-credit'

describe('compOffEarned', () => {
  it('keeps a used credit counted after it expires, so the balance stays at zero', () => {
    const credits = [{ days: 1, expiresOn: '2026-12-26' }]
    const uses = [{ startDate: '2026-10-10', paidDays: 1 }]
    expect(compOffEarned(credits, uses, '2026-11-01')).toBe(1)
    expect(compOffEarned(credits, uses, '2027-01-05')).toBe(1)
  })

  it('lapses only the unused part of an expired credit, oldest expiry first', () => {
    const credits = [{ days: 1, expiresOn: '2026-12-01' }, { days: 1, expiresOn: '2027-02-01' }]
    const uses = [{ startDate: '2026-11-10', paidDays: 1 }]
    expect(compOffEarned(credits, uses, '2026-12-15')).toBe(2)
    expect(compOffEarned(credits, [], '2026-12-15')).toBe(1)
  })
})
