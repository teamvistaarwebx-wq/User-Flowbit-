import { describe, expect, it } from 'vitest'
import { agingKey, avgCycleDays, bucketOf, buckets, onTimePercent, resolveRange } from './range'

describe('resolveRange', () => {
  const today = '2026-10-01'
  it('defaults to this month', () => expect(resolveRange({}, today)).toEqual({ preset: 'this_month', from: '2026-10-01', to: '2026-10-31' }))
  it('handles weeks, last month and the quarter', () => {
    expect(resolveRange({ range: 'this_week' }, today)).toMatchObject({ from: '2026-09-28', to: '2026-10-04' })
    expect(resolveRange({ range: 'last_week' }, today)).toMatchObject({ from: '2026-09-21', to: '2026-09-27' })
    expect(resolveRange({ range: 'last_month' }, today)).toMatchObject({ from: '2026-09-01', to: '2026-09-30' })
    expect(resolveRange({ range: 'this_quarter' }, today)).toMatchObject({ from: '2026-10-01', to: '2026-12-31' })
    expect(resolveRange({ range: 'this_quarter' }, '2026-08-15')).toMatchObject({ from: '2026-07-01', to: '2026-09-30' })
  })
  it('orders and clamps custom ranges', () => {
    expect(resolveRange({ from: '2026-10-10', to: '2026-10-01' }, today)).toEqual({ preset: 'custom', from: '2026-10-01', to: '2026-10-10' })
    expect(resolveRange({ range: 'custom', from: '2024-01-01', to: '2026-10-01' }, today).to).toBe('2025-01-01')
  })
})

describe('buckets', () => {
  it('uses days up to a month and weeks beyond', () => {
    expect(buckets({ from: '2026-10-01', to: '2026-10-03' }).map((b) => b.key)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    const weekly = buckets({ from: '2026-10-01', to: '2026-12-31' })
    expect(weekly[0]).toMatchObject({ key: '2026-09-28', from: '2026-10-01', to: '2026-10-04' })
    expect(bucketOf(weekly, '2026-10-05')).toBe(1)
    expect(bucketOf(weekly, '2027-01-02')).toBe(-1)
  })
})

describe('task maths', () => {
  it('buckets overdue age', () => {
    expect(agingKey(2)).toBe('1-3')
    expect(agingKey(7)).toBe('4-7')
    expect(agingKey(14)).toBe('8-14')
    expect(agingKey(40)).toBe('15+')
  })
  it('averages cycle time from start, else creation', () => {
    const d = (s: string) => new Date(s)
    expect(avgCycleDays([{ completedAt: d('2026-10-03T00:00:00Z'), startedAt: d('2026-10-01T00:00:00Z'), createdAt: d('2026-09-01T00:00:00Z') }, { completedAt: d('2026-10-05T00:00:00Z'), createdAt: d('2026-10-04T00:00:00Z') }])).toBe(1.5)
    expect(avgCycleDays([])).toBeNull()
  })
  it('counts on-time completion against due dates only', () => {
    expect(onTimePercent([{ completedDay: '2026-10-02', dueDate: '2026-10-02' }, { completedDay: '2026-10-05', dueDate: '2026-10-03' }, { completedDay: '2026-10-05' }])).toBe(50)
    expect(onTimePercent([{ completedDay: '2026-10-05' }])).toBeNull()
  })
})
