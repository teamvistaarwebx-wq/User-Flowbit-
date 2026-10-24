import { minutesOfDayIST, parseHHMM } from '@/lib/dates'
import { isBreakType, UNTYPED_BREAK, type BreakKey, type BreakMinutes } from '@/lib/break-types'

/**
 * Pure attendance arithmetic for one day (no database). The check-in widget
 * and Muster's register both use it so the numbers always agree.
 */

export type PunchType = 'in' | 'break_start' | 'break_end' | 'out'
/** `breakType` is set on a break_start punch (lib/break-types); breaks without one count as untyped. */
export type Punch = { type: PunchType; at: Date | string; breakType?: string | null }
export type PunchState = 'out' | 'in' | 'break'
export type AttendanceStatus = 'present' | 'late' | 'half_day' | 'absent' | 'leave' | 'holiday' | 'weekoff' | 'on_duty' | 'work_from_home' | 'sick_leave' | 'paid_half_day'

export type OfficeHours = { start: string; end: string; halfDayHours: number; graceMinutes?: number }

export const DEFAULT_OFFICE_HOURS: OfficeHours = { start: '10:00', end: '19:00', halfDayHours: 4.5, graceMinutes: 15 }

/**
 * The one default workday (B27), used everywhere a workspace has not set its
 * own hours: office hours 10:00–19:00 IST, Monday to Saturday, with an hour's
 * break, so 8 hours of work. Work estimates and team capacity count the 8
 * hours; automations' "business hours" are the office hours.
 */
export const DEFAULT_BREAK_MINUTES = 60
export const DEFAULT_WORK_WEEK: readonly number[] = [1, 2, 3, 4, 5, 6]
export const OFFICE_SPAN_MINUTES = parseHHMM(DEFAULT_OFFICE_HOURS.end) - parseHHMM(DEFAULT_OFFICE_HOURS.start)
/** One working day of work (estimates, capacity): the office span less the break, 480 minutes. */
export const WORKDAY_MINUTES = OFFICE_SPAN_MINUTES - DEFAULT_BREAK_MINUTES

/** A workspace's own day of work from its office hours (less the default break), for the timesheet's daily target (audit A13). */
export function workdayMinutesOf(hours: { start?: string | null; end?: string | null } | null | undefined): number {
  if (!hours?.start || !hours?.end) return WORKDAY_MINUTES
  const span = parseHHMM(hours.end) - parseHHMM(hours.start)
  return Number.isFinite(span) && span > DEFAULT_BREAK_MINUTES ? span - DEFAULT_BREAK_MINUTES : WORKDAY_MINUTES
}

export type DayResult = {
  status: AttendanceStatus
  workedMinutes: number
  breakMinutes: number
  /** Break minutes per type (lib/break-types), for paid/unpaid hours and the daily limits. */
  breakByType: BreakMinutes
  /** The type of the break running now, when on a break. */
  breakType: BreakKey | null
  firstIn: Date | null
  lastOut: Date | null
  state: PunchState
  /** When the current state began (null when out with no punches). */
  stateSince: Date | null
  late: boolean
}

/** The signed-in member's day, as the check-in widget shows it (JSON-safe). */
export type TodayState = {
  date: string
  state: PunchState
  stateSince: string | null
  workedMinutes: number
  breakMinutes: number
  /** Break minutes per type so far today, and the type of the break running now. */
  breakByType: BreakMinutes
  breakType: BreakKey | null
  /** Worked minutes plus paid break minutes within their limits (lib/break-types). */
  payableMinutes: number
  firstIn: string | null
  lastOut: string | null
  allowed: PunchType[]
  locked: boolean
  status: string
}

const NEXT: Record<PunchState, PunchType[]> = {
  out: ['in'],
  in: ['break_start', 'out'],
  break: ['break_end', 'out'],
}

/** Punches allowed from a state: out -> in; in -> break/out; break -> resume/out. */
export const allowedPunches = (state: PunchState): PunchType[] => NEXT[state]

const STATE_AFTER: Record<PunchType, PunchState> = { in: 'in', break_start: 'break', break_end: 'in', out: 'out' }

const PRESERVED: AttendanceStatus[] = ['leave', 'sick_leave', 'holiday', 'weekoff', 'on_duty', 'work_from_home', 'paid_half_day']
/** Marks that describe how the day was worked, so punches on that day keep them. */
const KEPT_WHEN_WORKED: AttendanceStatus[] = ['on_duty', 'work_from_home', 'paid_half_day']

/**
 * Works out a day from its punches. Invalid transitions in stored data are
 * skipped rather than trusted. While someone is still in (or on break) the
 * open segment counts up to `now`.
 */
export function computeDay(
  day: { punches: readonly Punch[]; status?: string | null },
  hours: OfficeHours = DEFAULT_OFFICE_HOURS,
  now: Date = new Date(),
): DayResult {
  const punches = [...day.punches]
    .map((p) => ({ type: p.type, at: new Date(p.at), breakType: p.breakType }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  let state: PunchState = 'out'
  let since: Date | null = null
  let worked = 0
  let breaks = 0
  let breakType: BreakKey | null = null
  const byType: Partial<Record<BreakKey, number>> = {}
  const addBreak = (minutes: number) => {
    const key = breakType ?? UNTYPED_BREAK
    byType[key] = (byType[key] ?? 0) + minutes
  }
  let firstIn: Date | null = null
  let lastOut: Date | null = null

  for (const punch of punches) {
    if (!NEXT[state].includes(punch.type)) continue
    const elapsed = since ? Math.max(0, (punch.at.getTime() - since.getTime()) / 60_000) : 0
    if (state === 'in') worked += elapsed
    if (state === 'break') {
      breaks += elapsed
      addBreak(elapsed)
    }
    if (punch.type === 'break_start') breakType = isBreakType(punch.breakType) ? punch.breakType : UNTYPED_BREAK
    if (punch.type === 'in' && !firstIn) firstIn = punch.at
    if (punch.type === 'out') lastOut = punch.at
    state = STATE_AFTER[punch.type]
    since = punch.at
  }

  if (since && state !== 'out') {
    const open = Math.max(0, (now.getTime() - since.getTime()) / 60_000)
    if (state === 'in') worked += open
    else {
      breaks += open
      addBreak(open)
    }
  }

  const workedMinutes = Math.round(worked)
  const breakMinutes = Math.round(breaks)
  const breakByType: BreakMinutes = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v)]))
  const currentBreak = state === 'break' ? breakType : null
  const preserved = PRESERVED.find((s) => s === day.status)

  if (!firstIn) {
    return { status: preserved ?? 'absent', workedMinutes, breakMinutes, breakByType, breakType: currentBreak, firstIn, lastOut, state, stateSince: since, late: false }
  }

  const late = minutesOfDayIST(firstIn) > parseHHMM(hours.start) + (hours.graceMinutes ?? 15)
  const short = state === 'out' && workedMinutes < hours.halfDayHours * 60
  const kept = KEPT_WHEN_WORKED.find((s) => s === preserved)
  const status: AttendanceStatus = kept ?? (short ? 'half_day' : late ? 'late' : 'present')
  return { status, workedMinutes, breakMinutes, breakByType, breakType: currentBreak, firstIn, lastOut, state, stateSince: since, late }
}

/** Office-hours progress for the workday timeline: 0..1 of the day elapsed at `now`. */
export function dayProgress(hours: OfficeHours, now: Date = new Date()): number {
  const start = parseHHMM(hours.start)
  const end = parseHHMM(hours.end)
  const current = minutesOfDayIST(now)
  if (end <= start) return 0
  return Math.min(1, Math.max(0, (current - start) / (end - start)))
}
