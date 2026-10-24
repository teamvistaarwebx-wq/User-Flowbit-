import { describe, expect, it } from 'vitest'
import { AMOUNT_ERROR, paise } from './validation'

describe('paise schema', () => {
  it('converts plain rupee amounts to paise', () => {
    expect(paise.parse('1,50,000')).toBe(15_000_000)
    expect(paise.parse(1250.5)).toBe(125_050)
    expect(paise.parse('')).toBe(0)
  })

  it('refuses shorthand and words with a rupee hint', () => {
    for (const value of ['1.5L', 'lots', '12abc']) {
      const result = paise.safeParse(value)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe(AMOUNT_ERROR)
    }
  })

  it('explains a missing amount instead of "Invalid input"', () => {
    const result = paise.safeParse(undefined)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(AMOUNT_ERROR)
  })

  it('refuses negative amounts', () => {
    expect(paise.safeParse('-5').error?.issues[0]?.message).toBe('Enter an amount of zero or more')
  })
})
