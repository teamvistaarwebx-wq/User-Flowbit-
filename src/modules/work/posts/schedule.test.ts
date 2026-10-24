import { describe, expect, it } from 'vitest'
import { duePostsFilter, isDue, istLocalToDate, publishPlan } from './schedule'

const now = new Date('2026-10-09T04:00:00Z') // 09:30 IST

describe('scheduled publishing', () => {
  it('reads composer times as IST', () => {
    expect(istLocalToDate('2026-10-10T09:30')?.toISOString()).toBe('2026-10-10T04:00:00.000Z')
    expect(istLocalToDate('tomorrow')).toBeNull()
  })
  it('publishes now without a time, or when the time has come', () => {
    expect(publishPlan(undefined, now)).toEqual({ ok: true, published: true })
    expect(publishPlan(new Date(now.getTime() - 3_600_000), now)).toEqual({ ok: true, published: true })
    expect(publishPlan(new Date(now.getTime() + 30_000), now)).toEqual({ ok: true, published: true })
  })
  it('schedules a later time, up to 90 days ahead', () => {
    const later = new Date('2026-10-10T04:00:00Z')
    expect(publishPlan(later, now)).toEqual({ ok: true, published: false, publishAt: later })
    expect(publishPlan(new Date('2027-02-01T00:00:00Z'), now).ok).toBe(false)
  })
  it('is due only when unpublished and its time has passed', () => {
    expect(isDue({ published: false, publishAt: new Date('2026-10-09T03:59:00Z') }, now)).toBe(true)
    expect(isDue({ published: false, publishAt: new Date('2026-10-09T04:15:00Z') }, now)).toBe(false)
    expect(isDue({ published: true, publishAt: new Date('2026-10-09T03:00:00Z') }, now)).toBe(false)
    expect(isDue({ published: false }, now)).toBe(false)
  })
  it('asks the database for unpublished, undeleted posts that are due', () => {
    expect(duePostsFilter(now)).toEqual({ published: false, publishAt: { $lte: now }, deletedAt: null })
  })
})
