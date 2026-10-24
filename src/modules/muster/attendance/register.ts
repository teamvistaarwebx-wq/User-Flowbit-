import type { Tone } from '@/lib/status'

/**
 * Pure month-register arithmetic. For every person and day it decides one
 * status, in this order: HR override → approved leave → the day's punches
 * (core AttendanceDay) → calendar (holiday / weekly off) → upcoming → the
 * unmarked-day policy. Payroll and the HR grid both read these numbers.
 */

/** Statuses HR can set on a day (the core AttendanceDay vocabulary). `leave` is paid leave. */
export const OVERRIDE_STATUSES = ['present', 'work_from_home', 'on_duty', 'late', 'paid_half_day', 'half_day', 'absent', 'leave', 'sick_leave', 'holiday', 'weekoff'] as const
export type OverrideStatus = (typeof OVERRIDE_STATUSES)[number]

/** The buttons on the daily sheet, in the order HR reaches for them. */
export const DAILY_STATUSES = ['present', 'work_from_home', 'absent', 'leave', 'sick_leave', 'paid_half_day', 'half_day', 'weekoff', 'holiday', 'on_duty'] as const satisfies readonly OverrideStatus[]

export type CellStatus = OverrideStatus | 'lop' | 'unmarked' | 'upcoming' | 'na'
export type CellSource = 'override' | 'leave' | 'punch' | 'calendar' | 'policy' | 'none'
export type UnmarkedPolicy = 'present' | 'absent' | 'pending'

export type Cell = {
  date: string
  status: CellStatus
  /** Fraction of the day that is paid (0, 0.5 or 1). */
  pay: number
  source: CellSource
  /** True when the status is an assumption (unmarked-day policy), not a record. */
  assumed?: boolean
  /** Half-day leave. */
  half?: boolean
  note?: string
}

export type DayInput = {
  date: string
  today: string
  inEmployment: boolean
  /** Weekday is in the org's work week. */
  workday: boolean
  holidayName?: string
  override?: { status: OverrideStatus; reason?: string }
  /** Approved leave; `sick` when it is sick leave (shown and counted as SL). */
  leave?: { paid: boolean; half: boolean; label: string; sick?: boolean }
  punch?: { status: string; worked: boolean }
  policy: UnmarkedPolicy
}

export const CELL_META: Record<CellStatus, { label: string; short: string; tone: Tone }> = {
  present: { label: 'Present', short: 'P', tone: 'success' },
  work_from_home: { label: 'Work from home', short: 'WFH', tone: 'info' },
  on_duty: { label: 'On duty', short: 'OD', tone: 'info' },
  late: { label: 'Late', short: 'LT', tone: 'warning' },
  paid_half_day: { label: 'Half day', short: 'HD', tone: 'warning' },
  half_day: { label: 'Unpaid half day', short: 'UHD', tone: 'orange' },
  absent: { label: 'Absent', short: 'A', tone: 'danger' },
  leave: { label: 'Paid leave', short: 'PL', tone: 'violet' },
  sick_leave: { label: 'Sick leave', short: 'SL', tone: 'violet' },
  lop: { label: 'Loss of pay', short: 'LOP', tone: 'danger' },
  holiday: { label: 'Holiday', short: 'H', tone: 'pink' },
  weekoff: { label: 'Week off', short: 'WO', tone: 'neutral' },
  unmarked: { label: 'Not marked yet', short: '?', tone: 'neutral' },
  upcoming: { label: 'Upcoming', short: '', tone: 'neutral' },
  na: { label: 'Not applicable', short: '', tone: 'neutral' },
}

/** What each status means, for hints on the daily sheet. */
export const STATUS_HINT: Partial<Record<OverrideStatus, string>> = {
  paid_half_day: 'Worked half the day; the other half is paid leave',
  half_day: 'Worked half the day; the other half is not paid',
  on_duty: 'Working away from the office, e.g. at a client',
  weekoff: 'A weekly off, e.g. an alternate Saturday',
}

export const PAY: Record<OverrideStatus, number> = {
  present: 1, work_from_home: 1, on_duty: 1, late: 1, paid_half_day: 1, leave: 1, sick_leave: 1, holiday: 1, weekoff: 1, half_day: 0.5, absent: 0,
}
const KNOWN = new Set<string>(OVERRIDE_STATUSES)
export const isOverrideStatus = (s: string): s is OverrideStatus => KNOWN.has(s)

const calendarCell = (i: DayInput): Cell | null => {
  if (i.holidayName) return { date: i.date, status: 'holiday', pay: 1, source: 'calendar', note: i.holidayName }
  if (!i.workday) return { date: i.date, status: 'weekoff', pay: 1, source: 'calendar' }
  return null
}

/** The one status for a person on a day. */
export function resolveDay(i: DayInput): Cell {
  const base = { date: i.date }
  if (!i.inEmployment) return { ...base, status: 'na', pay: 0, source: 'none' }
  if (i.override) return { ...base, status: i.override.status, pay: PAY[i.override.status], source: 'override', note: i.override.reason }
  if (i.leave) {
    const pay = i.leave.half ? (i.leave.paid ? 1 : 0.5) : i.leave.paid ? 1 : 0
    return { ...base, status: i.leave.paid ? (i.leave.sick ? 'sick_leave' : 'leave') : 'lop', pay, source: 'leave', half: i.leave.half, note: i.leave.label }
  }
  if (i.punch && isOverrideStatus(i.punch.status)) {
    const status = i.punch.status
    const emptyAbsent = status === 'absent' && !i.punch.worked
    if (!emptyAbsent) return { ...base, status, pay: PAY[status], source: 'punch' }
    const calendar = calendarCell(i)
    if (calendar) return calendar
    if (i.date >= i.today) return { ...base, status: 'upcoming', pay: 0, source: 'none' }
    return { ...base, status: 'absent', pay: 0, source: 'punch' }
  }
  const calendar = calendarCell(i)
  if (calendar) return calendar
  if (i.date >= i.today) return { ...base, status: 'upcoming', pay: 0, source: 'none' }
  if (i.policy === 'pending') return { ...base, status: 'unmarked', pay: 0, source: 'policy' }
  return { ...base, status: i.policy, pay: PAY[i.policy], source: 'policy', assumed: true }
}

export type MonthSummary = {
  /** Divisor for pay: every day of the month that is not a weekly off (holidays count). */
  workingDays: number
  payableDays: number
  lopDays: number
  presentDays: number
  lateDays: number
  halfDays: number
  absentDays: number
  leaveDays: number
  /** Part of leaveDays taken as sick leave. */
  sickLeaveDays: number
  /** Part of presentDays worked from home. */
  wfhDays: number
  unpaidLeaveDays: number
  holidays: number
  weeklyOffs: number
  unmarkedDays: number
  upcomingDays: number
  assumedDays: number
  notEmployedDays: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Totals for one person's month. `workingDays` covers the whole month (so a
 * mid-month joiner's pay is prorated against the full month), while payable
 * and loss-of-pay days only count days they were employed.
 */
export function summariseMonth(cells: readonly Cell[], workdays: ReadonlySet<string>): MonthSummary {
  const s: MonthSummary = {
    workingDays: 0, payableDays: 0, lopDays: 0, presentDays: 0, lateDays: 0, halfDays: 0, absentDays: 0, leaveDays: 0, sickLeaveDays: 0, wfhDays: 0,
    unpaidLeaveDays: 0, holidays: 0, weeklyOffs: 0, unmarkedDays: 0, upcomingDays: 0, assumedDays: 0, notEmployedDays: 0,
  }
  for (const c of cells) {
    const counts = workdays.has(c.date)
    if (counts) s.workingDays += 1
    if (c.status === 'na') {
      if (counts) s.notEmployedDays += 1
      continue
    }
    if (c.status === 'weekoff' && !counts) {
      s.weeklyOffs += 1
      continue
    }
    if (!counts) continue
    if (c.status === 'upcoming') {
      s.upcomingDays += 1
      continue
    }
    s.payableDays += c.pay
    s.lopDays += 1 - c.pay
    if (c.assumed) s.assumedDays += 1
    tally(s, c)
  }
  return { ...s, payableDays: r2(s.payableDays), lopDays: r2(s.lopDays), presentDays: r2(s.presentDays), leaveDays: r2(s.leaveDays), unpaidLeaveDays: r2(s.unpaidLeaveDays) }
}

function tally(s: MonthSummary, c: Cell) {
  switch (c.status) {
    case 'present':
    case 'on_duty':
      s.presentDays += 1
      break
    case 'work_from_home':
      s.presentDays += 1
      s.wfhDays += 1
      break
    case 'late':
      s.presentDays += 1
      s.lateDays += 1
      break
    case 'half_day':
      s.halfDays += 1
      break
    case 'paid_half_day':
      s.halfDays += 1
      s.presentDays += 0.5
      s.leaveDays += 0.5
      break
    case 'sick_leave':
      s.leaveDays += c.half ? 0.5 : 1
      s.sickLeaveDays += c.half ? 0.5 : 1
      if (c.half) s.presentDays += 0.5
      break
    case 'absent':
      s.absentDays += 1
      break
    case 'leave':
      s.leaveDays += c.half ? 0.5 : 1
      if (c.half) s.presentDays += 0.5
      break
    case 'lop':
      s.unpaidLeaveDays += c.half ? 0.5 : 1
      if (c.half) s.presentDays += 0.5
      break
    case 'holiday':
      s.holidays += 1
      break
    case 'weekoff':
      s.weeklyOffs += 1
      break
    case 'unmarked':
      s.unmarkedDays += 1
      break
    default:
      break
  }
}

/** Days of a month that are paid working days (weekday in the work week). */
export function workdaySet(days: readonly string[], workWeek: readonly number[], weekdayOf: (d: string) => number): Set<string> {
  return new Set(days.filter((d) => workWeek.includes(weekdayOf(d))))
}

/** Employed on a day: joined on or before it and not exited before it. */
export const employedOn = (date: string, joinDate: string, exitDate?: string | null) => date >= joinDate && (!exitDate || date <= exitDate)

const RECORDED = new Set<CellSource>(['override', 'leave', 'punch', 'calendar'])

/** Nothing is recorded for this working day yet (assumed by the unmarked-day policy, or today with no check-in). */
export const isUnmarked = (c: Cell) => c.source === 'policy' || (c.status === 'upcoming' && c.source === 'none')

/** Replacing something recorded (a check-in, approved leave, an earlier mark, a holiday or week off) needs a reason. */
export const needsReason = (c: Cell, next: OverrideStatus) => c.status !== next && RECORDED.has(c.source)

/** A working day for the person: employed, and not a holiday or week off on the calendar. */
export const isWorkingRow = (c: Cell) => c.status !== 'na' && c.source !== 'calendar'
