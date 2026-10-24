import { describe, expect, it } from 'vitest'
import { amountInWords, formatINR, formatINRCompact, formatINRForPrint, paiseToRupees, parseRupees, pct, rupeesToPaise, splitPaise } from './money'

describe('money', () => {
  it('converts rupees to integer paise without float drift', () => {
    expect(rupeesToPaise(19.99)).toBe(1999)
    expect(rupeesToPaise('1,23,456.78')).toBe(12_345_678)
    expect(rupeesToPaise('₹ 50')).toBe(5000)
    expect(rupeesToPaise('abc')).toBe(0)
    expect(paiseToRupees(12_345)).toBe(123.45)
  })

  it('refuses rupee text that is not a plain amount instead of truncating it', () => {
    expect(parseRupees('1.5L')).toBeNull()
    expect(parseRupees('lots')).toBeNull()
    expect(parseRupees('12abc')).toBeNull()
    expect(parseRupees('')).toBeNull()
    expect(parseRupees(Number.NaN)).toBeNull()
    expect(parseRupees('₹1,50,000')).toBe(15_000_000)
    expect(parseRupees('.5')).toBe(50)
    expect(parseRupees('-20')).toBe(-2000)
    expect(rupeesToPaise('1.5L')).toBe(0)
  })

  it('formats with Indian grouping', () => {
    expect(formatINR(12_345_678)).toBe('₹1,23,456.78')
    expect(formatINR(12_345_600, { decimals: 0 })).toBe('₹1,23,456')
  })

  it('formats compact Indian units', () => {
    expect(formatINRCompact(95_000)).toBe('₹950')
    expect(formatINRCompact(1_250_000)).toBe('₹12.5K')
    expect(formatINRCompact(34_000_000)).toBe('₹3.4L')
    expect(formatINRCompact(2_100_000_000)).toBe('₹2.1Cr')
    expect(formatINRCompact(-1_250_000)).toBe('-₹12.5K')
  })

  it('splits amounts exactly', () => {
    const parts = splitPaise(10_001, [50, 50])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_001)
    expect(parts).toEqual([5001, 5000])
  })

  it('computes zero-safe percentages', () => {
    expect(pct(3, 4)).toBe(75)
    expect(pct(1, 0)).toBe(0)
  })

  it('writes amounts in Indian words', () => {
    expect(amountInWords(12_005_050)).toBe('Rupees One Lakh Twenty Thousand Fifty and Fifty Paise Only')
    expect(amountInWords(0)).toBe('Rupees Zero Only')
    expect(amountInWords(1_00_00_000_00)).toBe('Rupees One Crore Only')
  })
})

describe('negative zero and print formatting', () => {
  it('prints a negated zero as ₹0.00, not -₹0.00', () => {
    expect(formatINR(-0)).toBe(formatINR(0))
  })
  it('prints PDF money as Rs. with en-IN grouping', () => {
    expect(formatINRForPrint(1_23_456_00)).toBe('Rs. 1,23,456.00')
    expect(formatINRForPrint(-0)).toBe('Rs. 0.00')
  })
})
