import { describe, expect, it } from 'vitest'
import { capacityMinutes, loadPercent, loadTone, memberCapacityMinutes, openTaskStats, periodRange } from './workload'

describe('periodRange', () => {
  it('covers Monday to Sunday and the month', () => {
    expect(periodRange('this_week', '2026-10-01')).toEqual({ from: '2026-09-28', to: '2026-10-04' })
    expect(periodRange('last_week', '2026-10-01')).toEqual({ from: '2026-09-21', to: '2026-09-27' })
    expect(periodRange('this_month', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })
})

describe('capacity and load', () => {
  it('counts 8 h per working day', () => expect(capacityMinutes('2026-09-28', '2026-10-04', [1, 2, 3, 4, 5, 6])).toBe(6 * 480))
  it('colours load by thresholds', () => {
    expect(loadTone(loadPercent(1000, 2880))).toBe('success')
    expect(loadTone(80)).toBe('warning')
    expect(loadTone(100)).toBe('warning')
    expect(loadTone(101)).toBe('danger')
    expect(loadPercent(10, 0)).toBe(0)
  })
})

describe('openTaskStats', () => {
  it('counts every assignee, not only the first', () => {
    const tasks = [
      { assigneeIds: ['b', 'a'], status: 'todo', dueDate: '2026-09-30', estimateMinutes: 60 },
      { assigneeIds: ['a'], status: 'blocked', dueDate: '2026-10-02', estimateMinutes: 120 },
      { assigneeIds: ['a'], status: 'done', dueDate: '2026-09-01', estimateMinutes: 30 },
    ]
    expect(openTaskStats('a', tasks, '2026-10-01', { from: '2026-09-28', to: '2026-10-04' })).toEqual({ open: 2, overdue: 1, dueInPeriod: 2, blocked: 1, estimateOpen: 180, estimateDue: 180 })
  })
})

describe('memberCapacityMinutes (QA 4.6)', () => {
  // Mon 28 Sep to Sun 4 Oct 2026, six-day week; 2 Oct (Fri) is Gandhi Jayanti.
  const week = { from: '2026-09-28', to: '2026-10-04' }
  const sixDays = [1, 2, 3, 4, 5, 6]

  it('takes holidays out of the working days', () => {
    expect(memberCapacityMinutes(week, sixDays, ['2026-10-02'], [])).toBe(5 * 480)
  })

  it('takes approved leave out, a half day as 4 h', () => {
    expect(memberCapacityMinutes(week, sixDays, ['2026-10-02'], [{ dates: ['2026-09-29', '2026-09-30'] }])).toBe(3 * 480)
    expect(memberCapacityMinutes(week, sixDays, [], [{ dates: ['2026-09-29'], isHalfDay: true }])).toBe(5.5 * 480)
  })

  it('ignores leave on holidays, weekly offs and outside the range, and never counts a day twice', () => {
    const leave = [{ dates: ['2026-10-02', '2026-10-04', '2026-10-06'] }, { dates: ['2026-09-28'] }, { dates: ['2026-09-28'], isHalfDay: true }]
    expect(memberCapacityMinutes(week, sixDays, ['2026-10-02'], leave)).toBe(4 * 480)
  })
})
