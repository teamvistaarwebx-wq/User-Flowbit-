import { describe, expect, it } from 'vitest'
import { bucketFor, collectionPriority, daysOverdue, daysSalesOutstanding, summariseAging, totalExposure } from './aging'

describe('daysOverdue', () => {
  it('is negative before the due date', () => {
    expect(daysOverdue('2026-10-10', '2026-10-01')).toBe(-9)
  })
  it('is zero on the due date', () => {
    expect(daysOverdue('2026-10-01', '2026-10-01')).toBe(0)
  })
  it('counts whole days', () => {
    expect(daysOverdue('2026-09-01', '2026-10-01')).toBe(30)
  })
  it('is not thrown off by daylight saving changes elsewhere', () => {
    expect(daysOverdue('2026-03-01', '2026-04-01')).toBe(31)
    expect(daysOverdue('2026-10-20', '2026-11-05')).toBe(16)
  })
})

describe('bucketFor', () => {
  it('treats due today as current', () => {
    expect(bucketFor(0)).toBe('current')
  })
  it('puts one day late in 1-30', () => {
    expect(bucketFor(1)).toBe('1_30')
  })
  it('is inclusive at 30, 60 and 90', () => {
    expect(bucketFor(30)).toBe('1_30')
    expect(bucketFor(31)).toBe('31_60')
    expect(bucketFor(60)).toBe('31_60')
    expect(bucketFor(61)).toBe('61_90')
    expect(bucketFor(90)).toBe('61_90')
    expect(bucketFor(91)).toBe('90_plus')
  })
})

describe('summariseAging', () => {
  const asOf = '2026-10-01'
  const rows = [
    { dueDate: '2026-10-05', balancePaise: 100 },
    { dueDate: '2026-09-20', balancePaise: 200 },
    { dueDate: '2026-08-20', balancePaise: 300 },
    { dueDate: '2026-07-20', balancePaise: 400 },
    { dueDate: '2026-05-01', balancePaise: 500 },
  ]

  it('puts one invoice in each bucket', () => {
    const s = summariseAging(rows, asOf)
    expect([s.current, s['1_30'], s['31_60'], s['61_90'], s['90_plus']]).toEqual([100, 200, 300, 400, 500])
  })
  it('makes the buckets add up to the total', () => {
    const s = summariseAging(rows, asOf)
    expect(s.current + s['1_30'] + s['31_60'] + s['61_90'] + s['90_plus']).toBe(s.total)
  })
  it('excludes current from overdue', () => {
    expect(summariseAging(rows, asOf).overdue).toBe(1400)
  })
  it('ignores settled invoices', () => {
    expect(summariseAging([{ dueDate: '2026-01-01', balancePaise: 0 }], asOf).total).toBe(0)
  })
  it('returns zeros for no invoices', () => {
    expect(summariseAging([], asOf)).toEqual({ current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0, total: 0, overdue: 0 })
  })
})

describe('daysSalesOutstanding', () => {
  it('scales receivables by the period', () => {
    expect(daysSalesOutstanding(50_000, 150_000, 90)).toBe(30)
  })
  it('is null when nothing was sold', () => {
    expect(daysSalesOutstanding(50_000, 0, 90)).toBeNull()
  })
})

describe('collectionPriority', () => {
  const asOf = '2026-10-01'
  const rows = [
    { id: 'a', dueDate: '2026-09-25', balancePaise: 900 },
    { id: 'b', dueDate: '2026-08-01', balancePaise: 100 },
    { id: 'c', dueDate: '2026-08-01', balancePaise: 500 },
  ]
  it('orders by age, then by amount', () => {
    expect(collectionPriority(rows, asOf).map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })
  it('does not mutate its input', () => {
    collectionPriority(rows, asOf)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('totalExposure', () => {
  it('ignores overpayment', () => {
    expect(totalExposure([{ balancePaise: 500 }, { balancePaise: -200 }])).toBe(500)
  })
})
