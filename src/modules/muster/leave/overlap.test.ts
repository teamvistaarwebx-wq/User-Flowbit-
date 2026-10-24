import { describe, expect, it } from 'vitest'
import { leaveOverlaps, leavePreviewText } from './overlap'

describe('leave overlap and preview (R1 2.11)', () => {
  const d = '2026-10-14'
  it('lets a morning and an afternoon half day on the same date both stand', () => {
    expect(leaveOverlaps({ startDate: d, endDate: d, isHalfDay: true, halfDaySession: 'first' }, { startDate: d, endDate: d, isHalfDay: true, halfDaySession: 'second' })).toBe(false)
  })
  it('still refuses the same half twice, half days without a session, and full-day clashes', () => {
    expect(leaveOverlaps({ startDate: d, endDate: d, isHalfDay: true, halfDaySession: 'first' }, { startDate: d, endDate: d, isHalfDay: true, halfDaySession: 'first' })).toBe(true)
    expect(leaveOverlaps({ startDate: d, endDate: d, isHalfDay: true }, { startDate: d, endDate: d, isHalfDay: true, halfDaySession: 'second' })).toBe(true)
    expect(leaveOverlaps({ startDate: '2026-10-13', endDate: '2026-10-15' }, { startDate: d, endDate: d })).toBe(true)
    expect(leaveOverlaps({ startDate: '2026-10-10', endDate: '2026-10-12' }, { startDate: d, endDate: d })).toBe(false)
  })
  it('previews paid days and loss of pay', () => {
    expect(leavePreviewText({ dayCount: 3, paidDays: 2, unpaidDays: 1 })).toBe('3 days: 2 days paid from the balance, 1 day as loss of pay.')
    expect(leavePreviewText({ dayCount: 0.5, paidDays: 0.5, unpaidDays: 0 })).toBe('0.5 days, all paid from the balance.')
  })
})
