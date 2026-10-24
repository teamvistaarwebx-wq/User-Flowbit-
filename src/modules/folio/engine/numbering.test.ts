import { describe, expect, test } from 'vitest'
import {
  addBillingPeriod,
  dueBillingDates,
  dueDateFor,
  financialYearOf,
  financialYearRange,
  firstBillingDate,
  documentNumberProblem,
  formatDocumentNumber,
  longestPrefix,
  seriesKey,
  seriesNumberLength,
  servicePeriodFor,
} from './numbering'

describe('financialYearOf', () => {
  test('April starts a new financial year', () => {
    expect(financialYearOf('2026-04-01')).toBe('2026-27')
  })

  test('March still belongs to the year that began the previous April', () => {
    expect(financialYearOf('2026-03-31')).toBe('2025-26')
  })

  test('handles the turn of the calendar year', () => {
    expect(financialYearOf('2026-12-31')).toBe('2026-27')
    expect(financialYearOf('2027-01-01')).toBe('2026-27')
  })

  test('spans a century boundary without producing 2099-00 nonsense', () => {
    expect(financialYearOf('2099-05-01')).toBe('2099-00')
    expect(financialYearOf('1999-04-01')).toBe('1999-00')
  })
})

describe('financialYearRange', () => {
  test('runs 1 April to 31 March', () => {
    expect(financialYearRange('2026-27')).toEqual({ start: '2026-04-01', end: '2027-03-31' })
  })

  test('ends on 31 March, leap year or not', () => {
    expect(financialYearRange('2027-28').end).toBe('2028-03-31')
    expect(financialYearRange('2023-24')).toEqual({ start: '2023-04-01', end: '2024-03-31' })
  })

  test('rejects a malformed label rather than inventing a range', () => {
    expect(() => financialYearRange('not-a-year')).toThrow()
  })
})

describe('formatDocumentNumber', () => {
  test('pads the sequence to a fixed width', () => {
    expect(formatDocumentNumber('VWX', '2026-27', 7)).toBe('VWX/2026-27/0007')
  })

  test('does not truncate a sequence that outgrows the padding', () => {
    expect(formatDocumentNumber('VWX', '2026-27', 123456)).toBe('VWX/2026-27/123456')
  })
})

describe('16-character GST limit', () => {
  test('prints the short year as 26-27', () => {
    expect(formatDocumentNumber('ACME', '2026-27', 1, 4, 'short')).toBe('ACME/26-27/0001')
  })

  test('measures a series from its prefix, padding and year format', () => {
    expect(seriesNumberLength('VWX', 4, 'long')).toBe(16)
    expect(seriesNumberLength('ACME', 4, 'long')).toBe(17)
    expect(seriesNumberLength('ACMEI', 4, 'short')).toBe(16)
  })

  test('allows a longer prefix with the short year', () => {
    expect(longestPrefix(4, 'long')).toBe(3)
    expect(longestPrefix(4, 'short')).toBe(5)
    expect(longestPrefix(6, 'short')).toBe(3)
  })

  test('accepts a 16-character number and refuses a 17-character one', () => {
    expect(documentNumberProblem('VWX/2026-27/0007')).toBeNull()
    expect(documentNumberProblem('ACME/2026-27/0001')).toMatch(/17 characters, but GST allows at most 16/)
  })
})

describe('seriesKey', () => {
  test('scopes a counter by kind, entity and financial year', () => {
    expect(seriesKey('invoice', 'e1', '2026-27')).toBe('folio:invoice:e1:2026-27')
  })
})

describe('dueDateFor', () => {
  test('adds the payment terms to the invoice date', () => {
    expect(dueDateFor('2026-08-01', 15)).toBe('2026-08-16')
  })

  test('due on issue means due the same day', () => {
    expect(dueDateFor('2026-08-01', 0)).toBe('2026-08-01')
  })

  test('crosses a month end correctly', () => {
    expect(dueDateFor('2026-08-25', 30)).toBe('2026-09-24')
  })
})

describe('addBillingPeriod', () => {
  test('advances a monthly retainer by one month', () => {
    expect(addBillingPeriod('2026-08-01', 'monthly', 1)).toBe('2026-09-01')
  })

  test('clamps the 31st to the length of the target month', () => {
    expect(addBillingPeriod('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
  })

  test('a clamped month does not shorten the one after it', () => {
    const february = addBillingPeriod('2026-01-31', 'monthly', 31)
    expect(addBillingPeriod(february, 'monthly', 31)).toBe('2026-03-31')
  })

  test('advances a quarterly retainer by three months, across a year end', () => {
    expect(addBillingPeriod('2026-11-15', 'quarterly', 15)).toBe('2027-02-15')
  })

  test('advances an annual retainer by twelve months', () => {
    expect(addBillingPeriod('2026-06-10', 'annual', 10)).toBe('2027-06-10')
  })
})

describe('firstBillingDate', () => {
  test('bills on the billing day of the starting month when it has not passed', () => {
    expect(firstBillingDate('2026-08-01', 'monthly', 5)).toBe('2026-08-05')
  })

  test('rolls to the next period when the billing day is already behind', () => {
    expect(firstBillingDate('2026-08-20', 'monthly', 5)).toBe('2026-09-05')
  })

  test('bills the same day when the start date is the billing day', () => {
    expect(firstBillingDate('2026-08-05', 'monthly', 5)).toBe('2026-08-05')
  })
})

describe('servicePeriodFor', () => {
  test('billing in advance covers the period beginning on the billing date', () => {
    expect(servicePeriodFor('2026-08-01', 'monthly', 1, true)).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    })
  })

  test('billing in arrears covers the period that just ended', () => {
    expect(servicePeriodFor('2026-09-01', 'monthly', 1, false)).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    })
  })

  test('billing in arrears on 1 October covers September', () => {
    expect(servicePeriodFor('2026-10-01', 'monthly', 1, false)).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  test('a quarterly retainer covers three months', () => {
    expect(servicePeriodFor('2026-04-01', 'quarterly', 1, true)).toEqual({
      start: '2026-04-01',
      end: '2026-06-30',
    })
  })
})

describe('dueBillingDates', () => {
  const retainer = {
    startDate: '2026-06-01',
    endDate: null,
    frequency: 'monthly' as const,
    billingDay: 1,
  }

  test('catches up every month a retainer was never billed for', () => {
    expect(dueBillingDates(retainer, '2026-08-15')).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ])
  })

  test('resumes from the last invoice rather than the start date', () => {
    expect(dueBillingDates({ ...retainer, lastInvoicedOn: '2026-07-01' }, '2026-08-15')).toEqual([
      '2026-08-01',
    ])
  })

  test('stops at the retainer end date', () => {
    expect(dueBillingDates({ ...retainer, endDate: '2026-07-15' }, '2026-12-01')).toEqual([
      '2026-06-01',
      '2026-07-01',
    ])
  })

  test('produces nothing before the retainer has started', () => {
    expect(dueBillingDates(retainer, '2026-05-01')).toEqual([])
  })

  test('is bounded, so a retainer left unbilled for a decade cannot spam the queue', () => {
    expect(dueBillingDates(retainer, '2046-01-01').length).toBe(24)
  })
})
