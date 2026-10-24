import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { AttendanceDay } from '@/models/AttendanceDay'
import { dayHours, mergeBreakPolicies, type BreakPolicies, type DayHours } from '@/lib/break-types'
import { computeDay, type OfficeHours, type Punch } from '@/lib/attendance-core'
import { officeHoursOf } from '@/lib/attendance'
import { minutesOfDayIST, parseHHMM, todayIST } from '@/lib/dates'
import { isMonthLocked } from './lock'
import { getRegister } from './queries'
import { isUnmarked, isWorkingRow, type Cell } from './register'

export type DaySheetRow = {
  employeeId: string
  name: string
  code: string
  department: string | null
  memberId: string | null
  joinDate: string
  cell: Cell
  inAt: string | null
  outAt: string | null
  /** Effective and payable minutes and breaks per type, when the person checked in that day. */
  hours: DayHours | null
  /** Where check-ins and check-outs were made, when a location was shared (lib/geo). */
  places: PunchPlace[]
  /** A check-in or check-out was made as a remote worker, so no location was asked for. */
  remote: boolean
  /** Still checked in (or on a break) today: `hours` runs to the moment the sheet was loaded. */
  live: boolean
  /** A late check-in: minutes after the office start (Settings → office hours). */
  lateMinutes: number | null
}

type DayLike = { punches?: readonly PunchLike[] | null; status?: string | null; firstIn?: Date | null; workedMinutes?: number | null; breakMinutes?: number | null; breakByType?: unknown }

/**
 * A person's hours and lateness on the sheet (pure). Today, while someone is still in or on a break, the stored
 * minutes are only those up to their last punch, so they are counted again up to `now`, as their own check-in card
 * does. Past days keep the stored minutes: a forgotten check-out never runs on into the next day.
 */
export function sheetTimes(day: DayLike | undefined, opts: { status: string; isToday: boolean; now: Date; hours: OfficeHours; policies: BreakPolicies }): { hours: DayHours | null; live: boolean; lateMinutes: number | null } {
  if (!day?.firstIn) return { hours: null, live: false, lateMinutes: null }
  const running = opts.isToday ? computeDay({ punches: (day.punches ?? []) as Punch[], status: day.status }, opts.hours, opts.now) : null
  const live = Boolean(running && running.state !== 'out')
  const hours = dayHours(live ? running! : day, opts.policies)
  const lateMinutes = opts.status === 'late' ? Math.max(0, minutesOfDayIST(day.firstIn) - parseHHMM(opts.hours.start)) : null
  return { hours, live, lateMinutes }
}

export type PunchPlace = { type: 'in' | 'out'; at: string; lat: number; lng: number; accuracy?: number; inside?: boolean; office?: string; distanceM?: number; radiusM?: number }

type PunchLike = { type: string; at: Date; geo?: { lat?: number | null; lng?: number | null; accuracy?: number | null; inside?: boolean | null; office?: string | null; distanceM?: number | null; radiusM?: number | null } | null }

/** Check-in and check-out punches that carry a location. */
export function placesOf(punches: readonly PunchLike[] | null | undefined): PunchPlace[] {
  return (punches ?? []).flatMap((p) => {
    if ((p.type !== 'in' && p.type !== 'out') || p.geo?.lat == null || p.geo?.lng == null) return []
    const g = p.geo
    return [{ type: p.type, at: p.at.toISOString(), lat: g.lat!, lng: g.lng!, ...(g.accuracy != null ? { accuracy: g.accuracy } : {}), ...(g.inside != null ? { inside: g.inside } : {}), ...(g.office ? { office: g.office } : {}), ...(g.distanceM != null ? { distanceM: g.distanceM } : {}), ...(g.radiusM != null ? { radiusM: g.radiusM } : {}) }]
  })
}

export type DaySheet = {
  date: string
  rows: DaySheetRow[]
  locked: boolean
  /** Rows that are a working day for the person (not before joining, not a holiday or week off on the calendar). */
  working: number
  unmarked: number
  unmarkedPolicy: 'present' | 'absent' | 'pending'
  seesEveryone: boolean
}

/** One row per person for a day: the resolved status, check-in times and how many are still unmarked. */
export async function getDaySheet(ctx: Ctx, date: string, opts: { departmentId?: string } = {}): Promise<DaySheet> {
  const [register, locked] = await Promise.all([getRegister(ctx, { start: date, end: date }, opts), isMonthLocked(ctx, date.slice(0, 7))])
  const memberIds = register.rows.flatMap((r) => (r.memberId ? [new Types.ObjectId(r.memberId)] : []))
  const days = memberIds.length ? await ctx.db(AttendanceDay).find({ memberId: { $in: memberIds }, date }, { memberId: 1, status: 1, firstIn: 1, lastOut: 1, workedMinutes: 1, breakMinutes: 1, breakByType: 1, punches: 1 }).lean() : []
  const timesBy = new Map(days.map((d) => [String(d.memberId), d]))
  const timing = { isToday: date === todayIST(), now: new Date(), hours: officeHoursOf(ctx), policies: mergeBreakPolicies(ctx.org.breakTypes) }
  const rows = register.rows.map((r) => {
    const t = r.memberId ? timesBy.get(r.memberId) : undefined
    const cell = r.cells[0]
    const { hours, live, lateMinutes } = sheetTimes(t, { ...timing, status: cell.status })
    return { employeeId: r.employeeId, name: r.name, code: r.code, department: r.department, memberId: r.memberId, joinDate: r.joinDate, cell, inAt: t?.firstIn?.toISOString() ?? null, outAt: t?.lastOut?.toISOString() ?? null, hours, live, lateMinutes, places: placesOf(t?.punches), remote: Boolean(t?.punches?.some((p) => p.remote)) }
  })
  return {
    date,
    rows,
    locked,
    working: rows.filter((r) => isWorkingRow(r.cell)).length,
    unmarked: rows.filter((r) => isWorkingRow(r.cell) && isUnmarked(r.cell)).length,
    unmarkedPolicy: register.unmarkedPolicy,
    seesEveryone: register.seesEveryone,
  }
}
