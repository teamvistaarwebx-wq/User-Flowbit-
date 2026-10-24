import { describe, expect, it } from 'vitest'
import { eachDay, weekday } from '@/lib/dates'
import { correctionProblem, withinCorrectionWindow } from './correction'
import { employedOn, isUnmarked, needsReason, resolveDay, summariseMonth, workdaySet, type DayInput } from './register'

const day = (patch: Partial<DayInput>): DayInput => ({ date: '2026-10-05', today: '2026-10-20', inEmployment: true, workday: true, policy: 'present', ...patch })

describe('resolveDay precedence', () => {
  it('lets an HR override win over punches and leave', () => {
    const cell = resolveDay(day({ override: { status: 'absent', reason: 'No show' }, leave: { paid: true, half: false, label: 'PL' }, punch: { status: 'present', worked: true } }))
    expect(cell).toMatchObject({ status: 'absent', pay: 0, source: 'override', note: 'No show' })
  })

  it('puts approved leave above punches', () => {
    expect(resolveDay(day({ leave: { paid: true, half: false, label: 'PL' }, punch: { status: 'absent', worked: false } }))).toMatchObject({ status: 'leave', pay: 1 })
  })

  it('pays unpaid leave nothing and unpaid half-day leave half', () => {
    expect(resolveDay(day({ leave: { paid: false, half: false, label: 'LWP' } })).pay).toBe(0)
    expect(resolveDay(day({ leave: { paid: false, half: true, label: 'LWP' } }))).toMatchObject({ status: 'lop', pay: 0.5, half: true })
    expect(resolveDay(day({ leave: { paid: true, half: false, label: 'Sick Leave', sick: true } }))).toMatchObject({ status: 'sick_leave', pay: 1 })
    expect(resolveDay(day({ leave: { paid: false, half: false, label: 'Sick Leave', sick: true } })).status).toBe('lop')
  })

  it('reads the punch status from the check-in widget', () => {
    expect(resolveDay(day({ punch: { status: 'late', worked: true } }))).toMatchObject({ status: 'late', pay: 1, source: 'punch' })
    expect(resolveDay(day({ punch: { status: 'half_day', worked: true } })).pay).toBe(0.5)
  })

  it('does not call an empty record on a holiday absent', () => {
    expect(resolveDay(day({ holidayName: 'Gandhi Jayanti', punch: { status: 'absent', worked: false } }))).toMatchObject({ status: 'holiday', pay: 1 })
  })

  it('treats an empty record for today or later as upcoming', () => {
    expect(resolveDay(day({ date: '2026-10-20', punch: { status: 'absent', worked: false } })).status).toBe('upcoming')
  })

  it('applies the calendar before the unmarked policy', () => {
    expect(resolveDay(day({ workday: false, policy: 'pending' })).status).toBe('weekoff')
    expect(resolveDay(day({ holidayName: 'Diwali', policy: 'absent' })).status).toBe('holiday')
  })

  it('follows the unmarked policy for past working days', () => {
    expect(resolveDay(day({ policy: 'present' }))).toMatchObject({ status: 'present', assumed: true, pay: 1 })
    expect(resolveDay(day({ policy: 'absent' }))).toMatchObject({ status: 'absent', assumed: true, pay: 0 })
    expect(resolveDay(day({ policy: 'pending' }))).toMatchObject({ status: 'unmarked', pay: 0 })
  })

  it('marks days outside employment as not employed', () => {
    expect(resolveDay(day({ inEmployment: false, punch: { status: 'present', worked: true } })).status).toBe('na')
    expect(employedOn('2026-10-09', '2026-10-10')).toBe(false)
    expect(employedOn('2026-10-31', '2026-01-01', '2026-10-15')).toBe(false)
  })
})

describe('summariseMonth', () => {
  const days = eachDay('2026-10-01', '2026-10-31')
  const workdays = workdaySet(days, [1, 2, 3, 4, 5, 6], weekday)

  it('counts 27 working days in October 2026 with Sundays off', () => {
    expect(workdays.size).toBe(27)
  })

  it('prorates a mid-month joiner against the whole month', () => {
    const cells = days.map((d) => resolveDay(day({ date: d, today: '2026-11-01', inEmployment: d >= '2026-10-15', workday: workdays.has(d) })))
    const s = summariseMonth(cells, workdays)
    expect(s.workingDays).toBe(27)
    expect(s.notEmployedDays).toBe(12)
    expect(s.payableDays).toBe(15)
    expect(s.lopDays).toBe(0)
  })

  it('adds absences and half days to loss of pay', () => {
    const cells = days.map((d) => {
      if (d === '2026-10-05') return resolveDay(day({ date: d, override: { status: 'absent' } }))
      if (d === '2026-10-06') return resolveDay(day({ date: d, punch: { status: 'half_day', worked: true } }))
      return resolveDay(day({ date: d, today: '2026-11-01', workday: workdays.has(d) }))
    })
    const s = summariseMonth(cells, workdays)
    expect(s.lopDays).toBe(1.5)
    expect(s.payableDays).toBe(25.5)
    expect(s.absentDays).toBe(1)
    expect(s.halfDays).toBe(1)
    expect(s.weeklyOffs).toBe(4)
  })

  it('pays work from home, sick leave and paid half days in full, and an unpaid half day by half', () => {
    const marks: Record<string, 'work_from_home' | 'sick_leave' | 'paid_half_day' | 'half_day'> = { '2026-10-05': 'work_from_home', '2026-10-06': 'sick_leave', '2026-10-07': 'paid_half_day', '2026-10-08': 'half_day' }
    const cells = days.map((d) => resolveDay(marks[d] ? day({ date: d, override: { status: marks[d] } }) : day({ date: d, today: '2026-11-01', workday: workdays.has(d) })))
    const s = summariseMonth(cells, workdays)
    expect(s.payableDays).toBe(26.5)
    expect(s.lopDays).toBe(0.5)
    expect(s.wfhDays).toBe(1)
    expect(s.sickLeaveDays).toBe(1)
    expect(s.leaveDays).toBe(1.5)
    expect(s.halfDays).toBe(2)
  })

  it('leaves upcoming days out of payable and loss of pay', () => {
    const cells = days.map((d) => resolveDay(day({ date: d, today: '2026-10-16', workday: workdays.has(d) })))
    const s = summariseMonth(cells, workdays)
    expect(s.upcomingDays).toBe(14)
    expect(s.payableDays).toBe(13)
  })
})

describe('corrections', () => {
  it('measures the window from the end of the day in IST', () => {
    const now = new Date('2026-10-16T18:00:00Z')
    expect(withinCorrectionWindow('2026-10-01', 360, now)).toBe(true)
    expect(withinCorrectionWindow('2026-09-30', 360, now)).toBe(false)
  })

  it('refuses leave, future days and no-op corrections', () => {
    expect(correctionProblem({ date: '2026-10-10', today: '2026-10-12', requested: 'leave', windowHours: 360 })).toContain('leave screen')
    expect(correctionProblem({ date: '2026-10-13', today: '2026-10-12', requested: 'present', windowHours: 360 })).toContain('not happened')
    expect(correctionProblem({ date: '2026-10-10', today: '2026-10-12', requested: 'present', current: 'present', windowHours: 360 })).toContain('already marked')
    expect(correctionProblem({ date: '2026-10-10', today: '2026-10-12', requested: 'present', current: 'absent', windowHours: 360, now: new Date('2026-10-12T06:00:00Z') })).toBeNull()
  })
})

describe('daily sheet rules', () => {
  it('treats assumed and not-yet-recorded days as unmarked, but not records or days before joining', () => {
    expect(isUnmarked(resolveDay(day({ policy: 'present' })))).toBe(true)
    expect(isUnmarked(resolveDay(day({ date: '2026-10-20' })))).toBe(true)
    expect(isUnmarked(resolveDay(day({ punch: { status: 'present', worked: true } })))).toBe(false)
    expect(isUnmarked(resolveDay(day({ inEmployment: false })))).toBe(false)
  })

  it('asks for a reason only when a recorded status changes', () => {
    expect(needsReason(resolveDay(day({ policy: 'present' })), 'absent')).toBe(false)
    expect(needsReason(resolveDay(day({ punch: { status: 'present', worked: true } })), 'absent')).toBe(true)
    expect(needsReason(resolveDay(day({ punch: { status: 'present', worked: true } })), 'present')).toBe(false)
    expect(needsReason(resolveDay(day({ holidayName: 'Diwali' })), 'present')).toBe(true)
  })
})
