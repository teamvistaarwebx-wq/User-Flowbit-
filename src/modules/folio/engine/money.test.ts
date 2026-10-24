import { describe, expect, test } from 'vitest'
import { amountInWords, formatINRForPrint, percentOf, roundToRupee, sumPaise, toPaise, toRupees } from './money'

describe('toPaise / toRupees', () => {
  test('converts a rupee amount to integer paise', () => {
    expect(toPaise(45000)).toBe(4_500_000)
    expect(toPaise(1234.56)).toBe(123_456)
  })

  test('rejects values that are not finite numbers', () => {
    expect(() => toPaise(Number.NaN)).toThrow(/finite/i)
  })

  test('converts paise back to a two-decimal rupee number', () => {
    expect(toRupees(123_456)).toBe(1234.56)
  })
})

describe('percentOf', () => {
  test('takes a percentage of a paise amount and rounds to whole paise', () => {
    expect(percentOf(toPaise(45000), 12)).toBe(toPaise(5400))
    expect(percentOf(toPaise(15000), 0.75)).toBe(toPaise(112.5))
  })

  test('returns zero for a zero base', () => {
    expect(percentOf(0, 12)).toBe(0)
  })

  test('refuses a non-finite percentage', () => {
    expect(() => percentOf(100, Number.NaN)).toThrow(/finite/i)
  })
})

describe('roundToRupee', () => {
  test('rounds to the nearest whole rupee in paise', () => {
    expect(roundToRupee(toPaise(112.5))).toBe(toPaise(113))
    expect(roundToRupee(toPaise(112.4))).toBe(toPaise(112))
  })
})

describe('sumPaise', () => {
  test('adds a list of paise amounts exactly', () => {
    expect(sumPaise([toPaise(0.1), toPaise(0.2)])).toBe(toPaise(0.3))
    expect(sumPaise([])).toBe(0)
  })
})

describe('amountInWords', () => {
  test('spells a whole rupee amount', () => {
    expect(amountInWords(5_076_900)).toBe('Fifty Thousand Seven Hundred Sixty Nine Rupees Only')
  })

  test('uses the lakh and crore scale', () => {
    expect(amountInWords(toPaise(147_500))).toBe('One Lakh Forty Seven Thousand Five Hundred Rupees Only')
    expect(amountInWords(toPaise(12_000_000))).toBe('One Crore Twenty Lakh Rupees Only')
  })

  test('adds paise when there are any', () => {
    expect(amountInWords(10_050)).toBe('One Hundred Rupees and Fifty Paise Only')
  })

  test('spells zero', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only')
  })

  test('prefixes negative amounts', () => {
    expect(amountInWords(-10_000)).toBe('Minus One Hundred Rupees Only')
  })
})

describe('formatINRForPrint', () => {
  test('prints Rs. with en-IN grouping, never the rupee glyph', () => {
    expect(formatINRForPrint(12_345_600)).toBe('Rs. 1,23,456.00')
    expect(formatINRForPrint(5)).toBe('Rs. 0.05')
    expect(formatINRForPrint(100)).not.toContain('₹')
  })
})
