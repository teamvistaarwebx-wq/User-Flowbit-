import { describe, expect, it, test } from 'vitest'
import { expenseAmountIssue, inputTaxPaise, netCostPaise, nextMonthSameDay, copyForwardDate, repeatDayOf } from './rules'

describe('netCostPaise', () => {
  it('leaves claimable GST out of the cost', () => {
    expect(netCostPaise({ amountPaise: 76_700_00, gstPaise: 11_700_00, itcEligible: true })).toBe(65_000_00)
    expect(inputTaxPaise({ amountPaise: 76_700_00, gstPaise: 11_700_00, itcEligible: true })).toBe(11_700_00)
  })
  it('counts GST that cannot be claimed as part of the cost', () => {
    expect(netCostPaise({ amountPaise: 11_800_00, gstPaise: 1_800_00, itcEligible: false })).toBe(11_800_00)
    expect(inputTaxPaise({ amountPaise: 11_800_00, gstPaise: 1_800_00 })).toBe(0)
  })
})

describe('expenseAmountIssue', () => {
  it('needs an amount above zero', () => {
    expect(expenseAmountIssue({ amountPaise: 0 })).toBe('Enter the amount paid.')
  })
  it('refuses GST equal to or above the amount', () => {
    expect(expenseAmountIssue({ amountPaise: 1_000_00, gstPaise: 1_000_00 })).toBe('The GST must be less than the amount paid.')
  })
  it('accepts a sensible expense', () => {
    expect(expenseAmountIssue({ amountPaise: 1_180_00, gstPaise: 180_00 })).toBeNull()
  })
})

describe('nextMonthSameDay', () => {
  it('moves to the same day next month', () => {
    expect(nextMonthSameDay('2026-09-05')).toBe('2026-10-05')
  })
  it('clamps to the end of a shorter month and rolls the year', () => {
    expect(nextMonthSameDay('2027-01-31')).toBe('2027-02-28')
    expect(nextMonthSameDay('2026-12-15')).toBe('2027-01-15')
  })
})

describe('copy forward dates', () => {
  test('keeps the original day after a short month', () => {
    expect(nextMonthSameDay('2027-01-31')).toBe('2027-02-28')
    expect(copyForwardDate({ date: '2027-02-28', repeatDay: 31 }, '2027-04-15')).toBe('2027-03-31')
    expect(repeatDayOf({ date: '2027-02-28' })).toBe(28)
  })

  test('never dates a copy after today', () => {
    expect(copyForwardDate({ date: '2026-09-28' }, '2026-10-03')).toBe('2026-10-03')
    expect(copyForwardDate({ date: '2026-09-02' }, '2026-10-03')).toBe('2026-10-02')
  })

  test('refuses a month that has not started', () => {
    expect(copyForwardDate({ date: '2026-10-01' }, '2026-10-03')).toBeNull()
  })
})
