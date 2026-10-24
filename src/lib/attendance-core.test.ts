import { describe, expect, it } from 'vitest'
import { istInstant } from './dates'
import { allowedPunches, computeDay, dayProgress, DEFAULT_OFFICE_HOURS, type Punch } from './attendance-core'

const D = '2026-10-01'
const at = (t: string) => istInstant(D, t)
const p = (type: Punch['type'], t: string): Punch => ({ type, at: at(t) })

describe('computeDay', () => {
  it('marks absent with no punches but keeps leave and holidays', () => {
    expect(computeDay({ punches: [] }).status).toBe('absent')
    expect(computeDay({ punches: [], status: 'leave' }).status).toBe('leave')
    expect(computeDay({ punches: [], status: 'holiday' }).status).toBe('holiday')
  })

  it('counts a full day minus breaks', () => {
    const r = computeDay({ punches: [p('in', '09:55'), p('break_start', '13:00'), p('break_end', '13:45'), p('out', '19:05')] })
    expect(r.status).toBe('present')
    expect(r.workedMinutes).toBe(9 * 60 + 10 - 45)
    expect(r.breakMinutes).toBe(45)
    expect(r.state).toBe('out')
    expect(r.firstIn?.toISOString()).toBe(at('09:55').toISOString())
  })

  it('marks late after the grace period', () => {
    expect(computeDay({ punches: [p('in', '10:15'), p('out', '19:00')] }).status).toBe('present')
    const late = computeDay({ punches: [p('in', '10:16'), p('out', '19:00')] })
    expect(late.status).toBe('late')
    expect(late.late).toBe(true)
  })

  it('marks half day when checked out under the half-day hours', () => {
    expect(computeDay({ punches: [p('in', '10:00'), p('out', '14:00')] }).status).toBe('half_day')
  })

  it('counts the open segment up to now while still in or on break', () => {
    const inNow = computeDay({ punches: [p('in', '10:00')] }, DEFAULT_OFFICE_HOURS, at('12:53'))
    expect(inNow.state).toBe('in')
    expect(inNow.workedMinutes).toBe(173)
    expect(inNow.status).toBe('present')
    const onBreak = computeDay({ punches: [p('in', '10:00'), p('break_start', '12:00')] }, DEFAULT_OFFICE_HOURS, at('12:20'))
    expect(onBreak.state).toBe('break')
    expect(onBreak.breakMinutes).toBe(20)
    expect(onBreak.workedMinutes).toBe(120)
  })

  it('ignores invalid transitions in stored data', () => {
    const r = computeDay({ punches: [p('break_start', '09:00'), p('in', '10:00'), p('in', '11:00'), p('out', '19:00')] })
    expect(r.workedMinutes).toBe(540)
  })

  it('sorts punches by time before computing', () => {
    const r = computeDay({ punches: [p('out', '19:00'), p('in', '10:00')] })
    expect(r.workedMinutes).toBe(540)
  })

  it('keeps work-from-home, sick leave and paid half days set by HR', () => {
    expect(computeDay({ punches: [], status: 'sick_leave' }).status).toBe('sick_leave')
    expect(computeDay({ punches: [], status: 'work_from_home' }).status).toBe('work_from_home')
    expect(computeDay({ punches: [p('in', '10:40'), p('out', '19:00')], status: 'work_from_home' }).status).toBe('work_from_home')
    expect(computeDay({ punches: [p('in', '10:00'), p('out', '14:00')], status: 'paid_half_day' }).status).toBe('paid_half_day')
  })

  it('lets punches replace a leave mark, since the person came in', () => {
    expect(computeDay({ punches: [p('in', '10:00'), p('out', '19:00')], status: 'sick_leave' }).status).toBe('present')
  })
})

describe('punch rules', () => {
  it('allows only the next sensible punches', () => {
    expect(allowedPunches('out')).toEqual(['in'])
    expect(allowedPunches('in')).toEqual(['break_start', 'out'])
    expect(allowedPunches('break')).toEqual(['break_end', 'out'])
  })

  it('reports workday progress within office hours', () => {
    expect(dayProgress(DEFAULT_OFFICE_HOURS, at('09:00'))).toBe(0)
    expect(dayProgress(DEFAULT_OFFICE_HOURS, at('14:30'))).toBe(0.5)
    expect(dayProgress(DEFAULT_OFFICE_HOURS, at('21:00'))).toBe(1)
  })
})

describe('the one default workday (B27)', () => {
  it('is 10:00–19:00 with an hour off, 8 hours of work, everywhere', async () => {
    const core = await import('./attendance-core')
    const { WORKDAY_MINUTES: taskDay } = await import('@/modules/work/tasks/constants')
    const { WORKDAY_MINUTES: capacityDay } = await import('@/modules/work/teams/workload')
    const { BUSINESS_HOURS } = await import('@/modules/automations/timing')
    expect(core.OFFICE_SPAN_MINUTES).toBe(540)
    expect(core.WORKDAY_MINUTES).toBe(480)
    expect(taskDay).toBe(core.WORKDAY_MINUTES)
    expect(capacityDay).toBe(core.WORKDAY_MINUTES)
    expect(BUSINESS_HOURS).toMatchObject({ start: core.DEFAULT_OFFICE_HOURS.start, end: core.DEFAULT_OFFICE_HOURS.end, days: [1, 2, 3, 4, 5, 6] })
  })
})

describe('workdayMinutesOf (audit A13)', () => {
  it("derives the timesheet's daily target from the workspace's office hours", async () => {
    const { workdayMinutesOf, WORKDAY_MINUTES } = await import('./attendance-core')
    expect(workdayMinutesOf({ start: '09:30', end: '18:30' })).toBe(480)
    expect(workdayMinutesOf({ start: '10:00', end: '17:00' })).toBe(360)
    expect(workdayMinutesOf(null)).toBe(WORKDAY_MINUTES)
    expect(workdayMinutesOf({ start: '10:00', end: '10:30' })).toBe(WORKDAY_MINUTES)
  })
})
