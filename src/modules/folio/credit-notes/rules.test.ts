import { describe, expect, test } from 'vitest'
import { computeInvoice } from '../engine/totals'
import { creditRoundsTotal, fitFullCredit, section34Deadline, section34Warning } from './rules'

const price = (taxablePaise: number) => computeInvoice({ lines: [{ description: 'Retainer', quantity: 1, rate: taxablePaise, gstRatePercent: 18 }], supplyType: 'intra_state', reverseCharge: false, roundOffTotal: true })

describe('fitFullCredit', () => {
  test('lands a full credit on the outstanding amount when they differ only by rounding', () => {
    // Arrange: ₹1,180 invoice, an earlier ₹0.42-taxable note rounded to ₹1, so ₹1,179 is left
    const rest = price(100_000 - 42)
    // Act
    const fitted = fitFullCredit(rest, 117_900)
    // Assert
    expect(rest.total).toBe(118_000)
    expect(fitted.total).toBe(117_900)
    expect(fitted.roundOff).toBe(117_900 - (rest.total - rest.roundOff))
  })

  test('does not strand a rupee when the note would round down', () => {
    // ₹999 taxable + ₹179.82 GST = ₹1,178.82, rounded to ₹1,179, but ₹1,179.50 is outstanding
    const rest = price(99_900)
    const fitted = fitFullCredit(rest, 117_950)
    expect(rest.total).toBe(117_900)
    expect(fitted).toMatchObject({ total: 117_950, roundOff: 68 })
  })

  test('leaves the note alone when the gap is a real payment, not rounding', () => {
    const rest = price(100_000)
    expect(fitFullCredit(rest, 50_000)).toBe(rest)
  })
})

describe('Sec 34 time limit', () => {
  test('runs to 30 November after the financial year of the invoice', () => {
    expect(section34Deadline('2026-10-01')).toBe('2027-11-30')
    expect(section34Deadline('2027-03-31')).toBe('2027-11-30')
    expect(section34Deadline('2027-04-01')).toBe('2028-11-30')
  })

  test('warns only for a note dated after the deadline', () => {
    expect(section34Warning('2026-10-01', '2027-11-30')).toBeNull()
    expect(section34Warning('2026-10-01', '2027-12-01')).toMatch(/until 2027-11-30 \(CGST Act Sec 34\)/)
  })
})

describe('creditRoundsTotal (6.7)', () => {
  test('follows a rounded invoice even after rounding is switched off', () => {
    expect(creditRoundsTotal({ totalPaise: 118_000, roundOffPaise: 18 }, false)).toBe(true)
  })

  test('follows an unrounded invoice even after rounding is switched on', () => {
    expect(creditRoundsTotal({ totalPaise: 117_982, roundOffPaise: 0 }, true)).toBe(false)
  })

  test('a whole-rupee total with no round-off falls back on the setting', () => {
    expect(creditRoundsTotal({ totalPaise: 118_000, roundOffPaise: 0 }, true)).toBe(true)
    expect(creditRoundsTotal({ totalPaise: 118_000 }, false)).toBe(false)
  })
})
