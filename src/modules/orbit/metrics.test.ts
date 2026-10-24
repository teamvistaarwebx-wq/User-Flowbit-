import { describe, expect, it } from 'vitest'
import { agingBucket, dailyTarget, deltaPct, funnel, isStale, pct1, targetState, weighted, winRate, EMPTY_FUNNEL } from './metrics'

describe('metrics', () => {
  it('rounds percentages to one decimal and returns null for 0 denominators', () => {
    expect(pct1(6, 121)).toBe(5)
    expect(pct1(6, 34)).toBe(17.6)
    expect(pct1(34, 121)).toBe(28.1)
    expect(pct1(3, 0)).toBeNull()
  })

  it('computes cold, warm and open from cohort counts', () => {
    const f = funnel({ ...EMPTY_FUNNEL, total: 148, contacted: 121, engaged: 34, meetingsBooked: 6, converted: 3, lost: 9, disqualified: 14 })
    expect(f.cold).toBe(5)
    expect(f.warm).toBe(17.6)
    expect(f.replyRate).toBe(28.1)
    expect(f.open).toBe(122)
  })

  it('caps target fill at 1', () => {
    expect(targetState(10, 5)).toEqual({ ok: true, fill: 1 })
    expect(targetState(1.5, 3)).toEqual({ ok: false, fill: 0.5 })
    expect(targetState(null, 3)).toEqual({ ok: false, fill: 0 })
  })

  it('splits weekly targets over 5- and 6-day weeks', () => {
    expect(dailyTarget(50, 5)).toBe(10)
    expect(dailyTarget(50, 6)).toBe(8)
    expect(dailyTarget(150, 6)).toBe(25)
  })

  it('weights, win rates and deltas', () => {
    expect(weighted(1_234_567, 33)).toBe(407_407)
    expect(weighted(150, 50)).toBe(75)
    expect(winRate(3, 1)).toBe(75)
    expect(winRate(0, 0)).toBeNull()
    expect(deltaPct(12, 10)).toBe(20)
    expect(deltaPct(5, 0)).toBeNull()
  })

  it('marks stale exactly at staleDays', () => {
    const now = new Date('2026-10-08T00:00:00Z')
    expect(isStale(new Date('2026-10-01T00:00:00Z'), 7, now)).toBe(true)
    expect(isStale(new Date('2026-10-01T00:00:01Z'), 7, now)).toBe(false)
    expect(isStale(null, 7, now)).toBe(false)
  })

  it('buckets ageing at the edges', () => {
    const today = '2026-10-01'
    const due = (late: number) => new Date(Date.parse(`${today}T00:00:00Z`) - late * 86_400_000).toISOString().slice(0, 10)
    expect(agingBucket(due(0), today)).toBe('not_due')
    expect(agingBucket(due(1), today)).toBe('d1_30')
    expect(agingBucket(due(30), today)).toBe('d1_30')
    expect(agingBucket(due(31), today)).toBe('d31_60')
    expect(agingBucket(due(60), today)).toBe('d31_60')
    expect(agingBucket(due(61), today)).toBe('d61_90')
    expect(agingBucket(due(90), today)).toBe('d61_90')
    expect(agingBucket(due(91), today)).toBe('d90_plus')
  })
})
