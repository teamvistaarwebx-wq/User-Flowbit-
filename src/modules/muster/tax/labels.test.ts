import { describe, expect, it } from 'vitest'
import { isNewActYear, OLD_ACT_REFUSAL, previousFy } from './labels'

describe('tax years under the 2025 Act (R1 3.3, 3.4)', () => {
  it('names Form 130 and 138 years from 2026-27 on only', () => {
    expect(isNewActYear('2026-27')).toBe(true)
    expect(isNewActYear('2027-28')).toBe(true)
    expect(isNewActYear('2025-26')).toBe(false)
    expect(isNewActYear('nonsense')).toBe(false)
    expect(OLD_ACT_REFUSAL).toMatch(/Form 16/)
  })
  it('finds last year for the previous Form 130', () => {
    expect(previousFy('2027-28')).toBe('2026-27')
    expect(previousFy('2000-01')).toBe('1999-00')
  })
})

describe('proof window wording (R1 2.7)', () => {
  it('shows dates as dates, not ISO strings', async () => {
    const { proofWindow } = await import('./windows')
    const state = proofWindow({ proofOpens: '2027-01-01', proofCloses: '2027-02-15' }, '2026-12-01')
    expect(state.open).toBe(false)
    expect(state.open ? '' : state.reason).not.toContain('2027-01-01')
  })
})
