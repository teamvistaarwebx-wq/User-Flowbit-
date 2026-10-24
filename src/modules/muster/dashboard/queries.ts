import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, daysBetween, monthOf, todayIST } from '@/lib/dates'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { CompOff } from '@/models/muster/CompOff'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { getMonthRegister } from '../attendance/queries'
import { isDecidableBy } from '../leave/approvals'
import { approvalActor, managerLapse, routedWith } from '../leave/routing'
import { DIRECTORY_STATUSES } from '../people/lifecycle'
import { readinessOf } from '../people/queries'
import { visibleEmployeeIds, visibleFilter } from '../people/scope'

const WINDOW_DAYS = 30

export type TodayBucket = 'in' | 'remote' | 'late' | 'half' | 'leave' | 'absent' | 'notIn' | 'off'
export type PersonToday = { id: string; name: string; bucket: TodayBucket }
export type Occasion = { id: string; name: string; date: string; kind: 'birthday' | 'anniversary'; years?: number }
export type Movement = { id: string; name: string; date: string; kind: 'joining' | 'joined' | 'leaving' | 'left'; designation: string | null }

const BUCKET: Record<string, TodayBucket> = {
  present: 'in', on_duty: 'remote', work_from_home: 'remote', late: 'late', half_day: 'half', paid_half_day: 'half', leave: 'leave', sick_leave: 'leave', lop: 'leave',
  absent: 'absent', upcoming: 'notIn', unmarked: 'notIn', holiday: 'off', weekoff: 'off',
}

/** Next occurrence (today or later) of a month-day within the window, or null. */
function nextOccurrence(iso: string, today: string): string | null {
  const md = iso.slice(5)
  const thisYear = `${today.slice(0, 4)}-${md}`
  const next = thisYear >= today ? thisYear : `${Number(today.slice(0, 4)) + 1}-${md}`
  return daysBetween(today, next) <= WINDOW_DAYS ? next : null
}

async function pendingApprovals(ctx: Ctx, visible: string[] | null) {
  const scope: Record<string, unknown> = { ...visibleFilter(visible, 'employeeId'), status: 'pending' }
  const projection = { employeeId: 1, managerId: 1, stages: 1, completedStages: 1, status: 1 }
  const [leaves, corrections, compOffs] = await Promise.all([
    ctx.can('leave.read') ? ctx.db(LeaveRequest).find(scope, projection).lean() : [],
    ctx.can('attendance.approve') ? ctx.db(AttendanceCorrection).find({ ...scope, kind: 'request' }, projection).lean() : [],
    ctx.can('attendance.approve') ? ctx.db(CompOff).find(scope, projection).lean() : [],
  ])
  const leaveActor = approvalActor(ctx, 'leave.approve')
  const attActor = approvalActor(ctx, 'attendance.approve')
  const [leaveRouted, attRouted] = await Promise.all([
    managerLapse(ctx, leaves, 'leave.approve').then(routedWith),
    managerLapse(ctx, [...corrections, ...compOffs], 'attendance.approve').then(routedWith),
  ])
  return {
    leave: leaves.filter((r) => isDecidableBy(leaveActor, leaveRouted(r))).length,
    corrections: corrections.filter((r) => isDecidableBy(attActor, attRouted(r))).length,
    compOffs: compOffs.filter((r) => isDecidableBy(attActor, attRouted(r))).length,
    leaveTotal: leaves.length,
  }
}

/** Everything the HR dashboard shows, for the people the viewer may see. */
export async function hrDashboard(ctx: Ctx) {
  const today = todayIST()
  const visible = await visibleEmployeeIds(ctx)
  const scope: Record<string, unknown> = { deletedAt: null, ...visibleFilter(visible) }
  const [people, departments, register, approvals] = await Promise.all([
    ctx.db(Employee).find(scope, { fullName: 1, status: 1, dob: 1, joinDate: 1, exitDate: 1, departmentId: 1, designation: 1, memberId: 1 }).lean(),
    ctx.db(Department).find({ deletedAt: null }, { name: 1 }).lean(),
    getMonthRegister(ctx, monthOf(today)),
    pendingApprovals(ctx, visible),
  ])
  const current = people.filter((p) => DIRECTORY_STATUSES.includes(p.status as (typeof DIRECTORY_STATUSES)[number]))

  const roll: PersonToday[] = register.rows
    .map((r) => ({ id: r.employeeId, name: r.name, bucket: BUCKET[r.cells.find((c) => c.date === today)?.status ?? 'upcoming'] ?? 'notIn' }))
    .filter((p) => current.some((c) => String(c._id) === p.id))
  const count = (b: TodayBucket) => roll.filter((p) => p.bucket === b).length

  const occasions: Occasion[] = current
    .flatMap((p) => {
      const out: Occasion[] = []
      const birthday = p.dob ? nextOccurrence(p.dob, today) : null
      if (birthday) out.push({ id: String(p._id), name: p.fullName, date: birthday, kind: 'birthday' })
      const anniversary = p.joinDate < today ? nextOccurrence(p.joinDate, today) : null
      const years = anniversary ? Number(anniversary.slice(0, 4)) - Number(p.joinDate.slice(0, 4)) : 0
      if (anniversary && years > 0) out.push({ id: String(p._id), name: p.fullName, date: anniversary, kind: 'anniversary', years })
      return out
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const from = addDays(today, -WINDOW_DAYS)
  const to = addDays(today, WINDOW_DAYS)
  const movements: Movement[] = people
    .flatMap((p) => {
      const out: Movement[] = []
      if (p.joinDate >= from && p.joinDate <= to) out.push({ id: String(p._id), name: p.fullName, date: p.joinDate, kind: p.joinDate > today ? 'joining' : 'joined', designation: p.designation ?? null })
      if (p.exitDate && p.exitDate >= from && p.exitDate <= to) out.push({ id: String(p._id), name: p.fullName, date: p.exitDate, kind: p.exitDate >= today ? 'leaving' : 'left', designation: p.designation ?? null })
      return out
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const deptCounts = departments
    .map((d) => ({ label: d.name, value: current.filter((p) => String(p.departmentId) === String(d._id)).length }))
    .filter((d) => d.value > 0)
  const unassigned = current.filter((p) => !p.departmentId).length

  const missing = ctx.can('people.write') ? [...(await readinessOf(ctx, current.map((p) => p._id))).values()].filter((m) => m.length > 0).length : 0

  return {
    today,
    headcount: current.length,
    onNotice: current.filter((p) => p.status === 'notice_period' || p.status === 'resigned').length,
    onProbation: current.filter((p) => p.status === 'probation').length,
    tiles: { in: count('in'), remote: count('remote'), late: count('late'), half: count('half'), leave: count('leave'), absent: count('absent'), notIn: count('notIn'), off: count('off') },
    roll,
    approvals,
    occasions,
    movements,
    deptCounts: unassigned ? [...deptCounts, { label: 'No department', value: unassigned }] : deptCounts,
    missing,
    monthLocked: register.locked,
  }
}
