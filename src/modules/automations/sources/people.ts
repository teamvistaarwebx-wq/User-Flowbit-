import 'server-only'
import type { Types } from 'mongoose'
import { DEFAULT_WORK_WEEK, addDays, formatDate, formatTime, todayIST, weekday } from '@/lib/dates'
import { escapeRegex } from '@/lib/utils'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Employee } from '@/models/muster/Employee'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { Holiday } from '@/models/muster/Holiday'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { isInDirectory } from '@/modules/muster/people/lifecycle'
import { onboardingStatus } from '@/modules/muster/people/onboarding'
import { docLabel } from '@/modules/muster/settings/defaults'
import { getPolicy } from '@/modules/muster/settings/queries'
import type { RunSubject } from '../types'
import { isoRange, SCAN_LIMIT, type OrgScope, type Source } from './common'
import { datesBetween, monthDayKeys, occurrenceIn, yearsAt } from './people-dates'

/**
 * Muster records for the People recipes: who has not checked in, who forgot
 * to check out, birthdays and work anniversaries, new joiners, joining
 * checklists, probation ends and expiring documents. Each subject names the
 * employee (refs.employeeId), their login when they have one, and their
 * manager's login.
 */

type EmployeeLite = { _id: Types.ObjectId; fullName: string; memberId?: Types.ObjectId | null; managerId?: Types.ObjectId | null; status: string; joinDate: string; dob?: string | null; probationEndDate?: string | null }

const FIELDS = { fullName: 1, memberId: 1, managerId: 1, status: 1, joinDate: 1, dob: 1, probationEndDate: 1 } as const

/** Login user ids of employees (by their member) and of their managers. */
async function peopleOf(scope: OrgScope, employees: readonly EmployeeLite[]) {
  const managerIds = [...new Set(employees.map((e) => e.managerId).filter(Boolean).map(String))]
  const managers = managerIds.length ? await scope.db(Employee).find({ _id: { $in: managerIds } }, { memberId: 1, fullName: 1 }).lean() : []
  const memberIds = [...employees.map((e) => e.memberId), ...managers.map((m) => m.memberId)].filter(Boolean)
  const members = memberIds.length ? await scope.db(Member).find({ _id: { $in: memberIds }, status: 'active' }, { userId: 1 }).lean() : []
  const userOf = new Map(members.map((m) => [String(m._id), String(m.userId)]))
  const managerOf = new Map(managers.map((m) => [String(m._id), { userId: m.memberId ? userOf.get(String(m.memberId)) : undefined, name: m.fullName }]))
  return (e: EmployeeLite) => {
    const user = e.memberId ? userOf.get(String(e.memberId)) : undefined
    const manager = e.managerId ? managerOf.get(String(e.managerId)) : undefined
    return { users: { employee: user ? [user] : [], manager: manager?.userId ? [manager.userId] : [] }, managerName: manager?.name ?? '' }
  }
}

const subject = (scope: OrgScope, e: EmployeeLite, who: Awaited<ReturnType<typeof peopleOf>>, extra: { occurrence?: string; vars?: Record<string, string | number>; href?: string } = {}): RunSubject => {
  const p = who(e)
  return {
    entity: 'Employee',
    entityId: String(e._id),
    occurrence: extra.occurrence,
    vars: { employee_name: e.fullName, business_name: scope.orgName, manager_name: p.managerName, ...extra.vars },
    refs: { employeeId: String(e._id), href: extra.href ?? `/app/hr/people/${e._id}`, users: p.users },
  }
}

const working = (employees: EmployeeLite[]) => employees.filter((e) => isInDirectory(e.status))

/** Today is a working day for the workspace (its work week, no company holiday). */
async function isWorkday(scope: OrgScope, today: string): Promise<boolean> {
  const org = await Org.findById(scope.orgId, { workWeek: 1 }).lean()
  const week = org?.workWeek?.length ? org.workWeek : DEFAULT_WORK_WEEK
  if (!week.includes(weekday(today))) return false
  return !(await scope.db(Holiday).exists({ date: today, isOptional: { $ne: true } }))
}

/** Employees with a login who have no check-in today, on a working day, and are not on approved leave. */
export const attendanceUnmarked: Source = async (scope, { now }) => {
  const today = todayIST(now)
  if (!(await isWorkday(scope, today))) return []
  const employees = working(await scope.db(Employee).find({ memberId: { $ne: null }, deletedAt: null }, FIELDS).limit(SCAN_LIMIT * 5).lean())
  const [marked, onLeave] = await Promise.all([
    scope.db(AttendanceDay).find({ date: today, memberId: { $in: employees.map((e) => e.memberId) }, $or: [{ firstIn: { $ne: null } }, { status: { $in: ['leave', 'holiday', 'weekoff', 'on_duty', 'sick_leave'] } }] }, { memberId: 1 }).lean(),
    scope.db(LeaveRequest).find({ status: 'approved', dates: today }, { employeeId: 1 }).lean(),
  ])
  const skip = new Set([...marked.map((d) => `m:${d.memberId}`), ...onLeave.map((l) => `e:${l.employeeId}`)])
  const due = employees.filter((e) => !skip.has(`m:${e.memberId}`) && !skip.has(`e:${e._id}`)).slice(0, SCAN_LIMIT)
  const who = await peopleOf(scope, due)
  return due.map((e) => subject(scope, e, who, { occurrence: today, href: '/app/me/attendance' }))
}

/** Employees whose day today has a check-in but no check-out yet. */
export const checkoutMissing: Source = async (scope, { now }) => {
  const today = todayIST(now)
  const days = await scope.db(AttendanceDay).find({ date: today, firstIn: { $ne: null } }, { memberId: 1, punches: 1, firstIn: 1 }).limit(SCAN_LIMIT * 5).lean()
  const open = days.filter((d) => (d.punches ?? []).at(-1)?.type !== 'out')
  if (!open.length) return []
  const employees = working(await scope.db(Employee).find({ memberId: { $in: open.map((d) => d.memberId) }, deletedAt: null }, FIELDS).lean())
  const inAt = new Map(open.map((d) => [String(d.memberId), d.firstIn]))
  const who = await peopleOf(scope, employees)
  return employees.slice(0, SCAN_LIMIT).map((e) => subject(scope, e, who, { occurrence: today, href: '/app/me/attendance', vars: { checked_in_at: inAt.get(String(e.memberId)) ? formatTime(inAt.get(String(e.memberId))!) : '' } }))
}

const yearly = (field: 'dob' | 'joinDate'): Source => async (scope, { window }) => {
  if (window?.unit !== 'days') return []
  const dates = datesBetween(window.from, window.to)
  const pattern = new RegExp(`-(${monthDayKeys(dates).map(escapeRegex).join('|')})$`)
  const employees = working(await scope.db(Employee).find({ [field]: pattern, deletedAt: null }, FIELDS).limit(SCAN_LIMIT).lean())
  const who = await peopleOf(scope, employees)
  return employees.flatMap((e) => {
    const stored = field === 'dob' ? e.dob : e.joinDate
    const on = stored ? occurrenceIn(stored, dates) : null
    if (!on || (field === 'joinDate' && yearsAt(e.joinDate, on) < 1)) return []
    return [subject(scope, e, who, { occurrence: on.slice(0, 4), vars: field === 'joinDate' ? { years: yearsAt(e.joinDate, on) } : {} })]
  })
}

export const employeeBirthday: Source = yearly('dob')
export const employeeAnniversary: Source = yearly('joinDate')

/** People joining on a day in the window (a welcome before Day 1 uses a negative offset). */
export const employeeJoining: Source = async (scope, { window }) => {
  const range = isoRange(window)
  if (!range) return []
  const employees = await scope.db(Employee).find({ joinDate: range, deletedAt: null, status: { $nin: ['candidate', 'offered', 'exited', 'terminated', 'absconded'] } }, FIELDS).limit(SCAN_LIMIT).lean()
  const who = await peopleOf(scope, employees)
  return employees.map((e) => subject(scope, e, who, { vars: { join_date: formatDate(e.joinDate) } }))
}

/** Joiners (joining pending, or joined in the last 60 days) whose mandatory documents are not all on file. */
export const onboardingIncomplete: Source = async (scope, { now }) => {
  const since = addDays(todayIST(now), -60)
  const [policy, employees] = await Promise.all([getPolicy({ db: scope.db }), scope.db(Employee).find({ deletedAt: null, $or: [{ status: 'joining_pending' }, { joinDate: { $gte: since } }] }, FIELDS).limit(SCAN_LIMIT).lean()])
  if (!employees.length || !policy.onboarding.mandatoryDocuments.length) return []
  const docs = await scope.db(EmployeeDocument).find({ employeeId: { $in: employees.map((e) => e._id) }, deletedAt: null }, { employeeId: 1, docType: 1 }).lean()
  const byEmployee = new Map<string, string[]>()
  for (const d of docs) byEmployee.set(String(d.employeeId), [...(byEmployee.get(String(d.employeeId)) ?? []), d.docType])
  const who = await peopleOf(scope, employees)
  return employees.flatMap((e) => {
    const status = onboardingStatus(policy.onboarding, byEmployee.get(String(e._id)) ?? [])
    if (status.percent >= 100) return []
    return [subject(scope, e, who, { occurrence: todayIST(now), vars: { checklist_percent: status.percent, missing_items: status.missing.map(docLabel).join(', ') } })]
  })
}

/** People on probation whose recorded probation end falls in the window. */
export const probationEnd: Source = async (scope, { window }) => {
  const range = isoRange(window)
  if (!range) return []
  const employees = await scope.db(Employee).find({ status: 'probation', probationEndDate: range, deletedAt: null }, FIELDS).limit(SCAN_LIMIT).lean()
  const who = await peopleOf(scope, employees)
  return employees.map((e) => subject(scope, e, who, { occurrence: e.probationEndDate ?? undefined, vars: { probation_end: formatDate(e.probationEndDate) } }))
}

/** Documents on file (IDs, contracts, visas) whose expiry date falls in the window; one run per document. */
export const documentExpiry: Source = async (scope, { window }) => {
  const range = isoRange(window)
  if (!range) return []
  const docs = await scope.db(EmployeeDocument).find({ expiresOn: range, deletedAt: null }, { employeeId: 1, docType: 1, expiresOn: 1 }).limit(SCAN_LIMIT).lean()
  const employees = working(await scope.db(Employee).find({ _id: { $in: docs.map((d) => d.employeeId) }, deletedAt: null }, FIELDS).lean())
  const byId = new Map(employees.map((e) => [String(e._id), e]))
  const who = await peopleOf(scope, employees)
  return docs.flatMap((d) => {
    const e = byId.get(String(d.employeeId))
    if (!e) return []
    const run = subject(scope, e, who, { occurrence: d.expiresOn ?? undefined, vars: { document_type: docLabel(d.docType), expires_on: formatDate(d.expiresOn) } })
    return [{ ...run, entity: 'EmployeeDocument', entityId: String(d._id) }]
  })
}
