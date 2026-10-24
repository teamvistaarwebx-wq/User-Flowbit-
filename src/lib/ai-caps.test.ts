import { describe, expect, it } from 'vitest'
import { aiAllowance, aiBlockReason, aiMonthIST, DEFAULT_AI_CAPS, mergeAiCaps } from './ai-caps'

describe('AI caps', () => {
  it('defaults to Free 0, Trial 50 and paid 500 requests a month', () => {
    expect(DEFAULT_AI_CAPS).toMatchObject({ free: 0, trial: 50, paid: 500 })
    expect(mergeAiCaps(undefined)).toEqual(DEFAULT_AI_CAPS)
  })

  it('keeps valid stored caps and replaces bad ones with the default', () => {
    const caps = mergeAiCaps({ trial: 20, paid: -1, free: 2.5, comped: 'lots', internal: 999_999 })
    expect(caps).toMatchObject({ trial: 20, paid: 500, free: 0, comped: 500, internal: 500 })
  })

  it('counts the month in IST', () => {
    expect(aiMonthIST(new Date('2026-10-31T19:00:00Z'))).toBe('2026-11')
    expect(aiMonthIST(new Date('2026-10-31T18:00:00Z'))).toBe('2026-10')
  })

  it('allows requests until the cap is used up', () => {
    expect(aiAllowance(50, 49)).toEqual({ cap: 50, used: 49, left: 1, allowed: true })
    expect(aiAllowance(50, 50).allowed).toBe(false)
    expect(aiAllowance(0, 0).allowed).toBe(false)
  })
})

describe('aiBlockReason', () => {
  it('is null while requests are left', () => {
    expect(aiBlockReason(aiAllowance(50, 10))).toBeNull()
  })

  it('says "plan" when the plan has no AI (cap 0)', () => {
    expect(aiBlockReason(aiAllowance(0, 0))).toBe('plan')
  })

  it('says "cap" when the month is used up', () => {
    expect(aiBlockReason(aiAllowance(50, 50))).toBe('cap')
  })
})
