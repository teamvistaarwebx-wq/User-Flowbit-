import { describe, expect, it } from 'vitest'
import { expectedMinutes, isWeekEditable, normaliseWeek, submitProblem, weekDays, weekLabel } from './week'

describe('week helpers', () => {
  it('lists Monday to Sunday', () => {
    expect(weekDays('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })
  it('labels the range', () => expect(weekLabel('2026-09-28')).toBe('28 Sep – 4 Oct'))
  it('snaps any day to its Monday and falls back to this week', () => {
    expect(normaliseWeek('2026-10-01', '2026-10-01')).toBe('2026-09-28')
    expect(normaliseWeek('junk', '2026-10-04')).toBe('2026-09-28')
  })
  it('counts expected minutes on working days only', () => {
    expect(expectedMinutes('2026-09-28', [1, 2, 3, 4, 5, 6])).toBe(6 * 8 * 60)
    expect(expectedMinutes('2026-09-28', [1, 2, 3, 4, 5])).toBe(5 * 8 * 60)
  })
  it('locks submitted and approved weeks', () => {
    expect(isWeekEditable('draft')).toBe(true)
    expect(isWeekEditable('rejected')).toBe(true)
    expect(isWeekEditable('submitted')).toBe(false)
    expect(isWeekEditable('approved')).toBe(false)
  })
  it('explains why a week cannot be submitted', () => {
    expect(submitProblem({ status: 'draft', totalMinutes: 0, hasRunningTimer: false })).toBe('Log some time before submitting.')
    expect(submitProblem({ status: 'draft', totalMinutes: 60, hasRunningTimer: true })).toBe('Stop your timer before submitting.')
    expect(submitProblem({ status: 'submitted', totalMinutes: 60, hasRunningTimer: false })).toBe('This week is already submitted.')
    expect(submitProblem({ status: 'rejected', totalMinutes: 60, hasRunningTimer: false })).toBeNull()
  })
})
