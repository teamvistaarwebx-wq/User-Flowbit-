import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { eachDay, monthRange, todayIST, weekday } from '@/lib/dates'
import { AttendanceDay } from '@/models/AttendanceDay'
import { addDayHours, dayHours, mergeBreakPolicies, NO_HOURS, type DayHours } from '@/lib/break-types'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { SICK_LEAVE_CODE } from '../settings/defaults'
import { getPolicy, orgCalendar } from '../settings/queries'
import { visibleEmployeeIds, visibleFilter } from '../people/scope'
import { employedOn, isOverrideStatus, resolveDay, summariseMonth, workdaySet, type Cell, type MonthSummary, type OverrideStatus } from './register'

const PRE_JOINING = ['candidate', 'offered', 'joining_pending']

export type RegisterRow = {
  employeeId: string
  name: string
  code: string
  department: string | null
  memberId: string | null
  joinDate: string
  cells: Cell[]
  summary: MonthSummary
  /** Effective and payable minutes over the span, with break minutes per type (lib/break-types). */
  hours: DayHours
}

export type Register = {
  month: string
  days: string[]
  holidayNames: Record<string, string>
  workdays: string[]
  rows: RegisterRow[]
  locked: boolean
  period: { lockedAt: string | null; lockedByName: string | null; reopenedReason: string | null } | null
  unmarkedPolicy: 'present' | 'absent' | 'pending'
  seesEveryone: boolean
}

export type RegisterOpts = { employeeIds?: string[]; departmentId?: string }

const key = (a: unknown, b: string) => `${String(a)}|${b}`

export type RangeRegister = Omit<Register, 'month' | 'locked' | 'period'> & { start: string; end: string }

/**
 * Resolved cells for everyone the viewer may see (or `employeeIds`) over any
 * span of days: one cell per person and day, plus each person's totals over
 * the span. The month register, the daily sheet and the trend chart all read it.
 */
export async function getRegister(ctx: Ctx, span: { start: string; end: string }, opts: RegisterOpts = {}): Promise<RangeRegister> {
  const { start, end } = span
  const days = eachDay(start, end)
  const visible = await visibleEmployeeIds(ctx)
  const filter: Record<string, unknown> = {
    deletedAt: null,
    status: { $nin: PRE_JOINING },
    joinDate: { $lte: end },
    $or: [{ exitDate: null }, { exitDate: '' }, { exitDate: { $gte: start } }],
    ...visibleFilter(visible),
  }
  if (opts.employeeIds) filter._id = { $in: opts.employeeIds.filter((id) => visible === null || visible.includes(id)).map((id) => new Types.ObjectId(id)) }
  if (opts.departmentId && Types.ObjectId.isValid(opts.departmentId)) filter.departmentId = new Types.ObjectId(opts.departmentId)

  const [employees, calendar, policy, departments] = await Promise.all([
    ctx.db(Employee).find(filter, { fullName: 1, code: 1, departmentId: 1, memberId: 1, joinDate: 1, exitDate: 1 }).sort({ fullName: 1 }).lean(),
    orgCalendar(ctx, start, end),
    getPolicy(ctx),
    ctx.db(Department).find({}, { name: 1 }).lean(),
  ])
  const ids = employees.map((e) => e._id)
  const memberIds = employees.map((e) => e.memberId).filter((id): id is Types.ObjectId => Boolean(id))
  const [overrides, leaves, punches] = await Promise.all([
    ctx.db(AttendanceCorrection).find({ employeeId: { $in: ids }, status: 'approved', date: { $gte: start, $lte: end } }, { employeeId: 1, date: 1, requestedStatus: 1, reason: 1 }).sort({ decidedAt: 1, createdAt: 1 }).lean(),
    ctx.db(LeaveRequest).find({ employeeId: { $in: ids }, status: 'approved', startDate: { $lte: end }, endDate: { $gte: start } }).lean(),
    memberIds.length ? ctx.db(AttendanceDay).find({ memberId: { $in: memberIds }, date: { $gte: start, $lte: end } }, { memberId: 1, date: 1, status: 1, workedMinutes: 1, breakMinutes: 1, breakByType: 1, punches: { $slice: 1 } }).lean() : [],
  ])

  const overrideBy = new Map(overrides.filter((o) => isOverrideStatus(o.requestedStatus)).map((o) => [key(o.employeeId, o.date), { status: o.requestedStatus as OverrideStatus, reason: o.reason }]))
  const leaveBy = new Map<string, { paid: boolean; half: boolean; label: string; sick: boolean }>()
  for (const l of leaves) {
    const unpaid = new Set(l.unpaidDates ?? [])
    for (const d of l.dates ?? []) leaveBy.set(key(l.employeeId, d), { paid: !unpaid.has(d), half: Boolean(l.isHalfDay), label: l.leaveName, sick: l.leaveCode === SICK_LEAVE_CODE })
  }
  const punchBy = new Map(punches.map((p) => [key(p.memberId, p.date), { status: p.status, worked: (p.punches?.length ?? 0) > 0 }]))
  const policies = mergeBreakPolicies(ctx.org.breakTypes)
  const hoursBy = new Map<string, DayHours>()
  for (const p of punches) hoursBy.set(String(p.memberId), addDayHours(hoursBy.get(String(p.memberId)) ?? NO_HOURS, dayHours(p, policies)))
  const workdays = workdaySet(days, calendar.workWeek, weekday)
  const deptName = new Map(departments.map((d) => [String(d._id), d.name]))
  const today = todayIST()

  const rows: RegisterRow[] = employees.map((e) => {
    const cells = days.map((date) =>
      resolveDay({
        date,
        today,
        inEmployment: employedOn(date, e.joinDate, e.exitDate),
        workday: workdays.has(date),
        holidayName: calendar.holidayNames.get(date),
        override: overrideBy.get(key(e._id, date)),
        leave: leaveBy.get(key(e._id, date)),
        punch: e.memberId ? punchBy.get(key(e.memberId, date)) : undefined,
        policy: policy.attendance.unmarkedPolicy,
      }),
    )
    return {
      employeeId: String(e._id),
      name: e.fullName,
      code: e.code,
      department: e.departmentId ? (deptName.get(String(e.departmentId)) ?? null) : null,
      memberId: e.memberId ? String(e.memberId) : null,
      joinDate: e.joinDate,
      cells,
      summary: summariseMonth(cells, workdays),
      hours: (e.memberId ? hoursBy.get(String(e.memberId)) : undefined) ?? NO_HOURS,
    }
  })

  return {
    start,
    end,
    days,
    holidayNames: Object.fromEntries(calendar.holidayNames),
    workdays: [...workdays],
    rows,
    unmarkedPolicy: policy.attendance.unmarkedPolicy,
    seesEveryone: visible === null,
  }
}

/**
 * The month register for everyone the viewer may see (or `employeeIds`).
 * Payroll reads the same function for payable and loss-of-pay days.
 */
export async function getMonthRegister(ctx: Ctx, month: string, opts: RegisterOpts = {}): Promise<Register> {
  const [register, period] = await Promise.all([getRegister(ctx, monthRange(month), opts), ctx.db(AttendancePeriod).findOne({ period: month }).lean()])
  const { days, holidayNames, workdays, rows, unmarkedPolicy, seesEveryone } = register
  return {
    month,
    days,
    holidayNames,
    workdays,
    rows,
    unmarkedPolicy,
    seesEveryone,
    locked: period?.status === 'locked',
    period: period ? { lockedAt: period.lockedAt?.toISOString() ?? null, lockedByName: period.lockedByName ?? null, reopenedReason: period.reopenedReason ?? null } : null,
  }
}

/** One person's resolved status on a day (for corrections). */
export async function dayCellFor(ctx: Ctx, employeeId: string, date: string): Promise<Cell | null> {
  const register = await getRegister(ctx, { start: date, end: date }, { employeeIds: [employeeId] })
  return register.rows[0]?.cells[0] ?? null
}
