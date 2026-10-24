import { describe, expect, test } from 'vitest'
import { gapBillingDates } from './schedule-math'

const monthly = { startDate: '2026-07-01', frequency: 'monthly' as const, billingDay: 1, billInAdvance: true }
const month = (date: string, end: string) => ({ date, start: date, end })

describe('gapBillingDates', () => {
  test('nothing billed, no gaps', () => {
    expect(gapBillingDates(monthly, [])).toEqual([])
  })

  test('a deleted middle draft makes its period due again', () => {
    const billed = [month('2026-07-01', '2026-07-31'), month('2026-09-01', '2026-09-30'), month('2026-10-01', '2026-10-31')]
    expect(gapBillingDates(monthly, billed)).toEqual(['2026-08-01'])
  })

  test('an unbroken run has no gaps', () => {
    const billed = [month('2026-07-01', '2026-07-31'), month('2026-08-01', '2026-08-31'), month('2026-09-01', '2026-09-30')]
    expect(gapBillingDates(monthly, billed)).toEqual([])
  })

  test('switching quarterly to monthly does not re-bill months a quarter already covers', () => {
    const billed = [{ date: '2026-07-01', start: '2026-07-01', end: '2026-09-30' }, { date: '2026-10-01', start: '2026-10-01', end: '2026-12-31' }]
    expect(gapBillingDates(monthly, billed)).toEqual([])
  })

  test('moving the billing day does not re-bill covered periods', () => {
    const billed = [month('2026-07-01', '2026-07-31'), month('2026-08-01', '2026-08-31'), month('2026-09-01', '2026-09-30')]
    expect(gapBillingDates({ ...monthly, billingDay: 15 }, billed)).toEqual([])
  })

  test('moving the start date earlier does not bill months before the first invoice', () => {
    const billed = [month('2026-07-01', '2026-07-31'), month('2026-08-01', '2026-08-31')]
    expect(gapBillingDates({ ...monthly, startDate: '2026-05-01' }, billed)).toEqual([])
  })

  test('without stored periods, only the exact billing date counts', () => {
    expect(gapBillingDates(monthly, [{ date: '2026-07-01' }, { date: '2026-09-01' }])).toEqual(['2026-08-01'])
  })
})
