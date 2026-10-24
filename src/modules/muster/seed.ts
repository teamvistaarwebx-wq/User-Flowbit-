import type { Types } from 'mongoose'
import { addDays, eachDay, istInstant, weekday } from '@/lib/dates'
import type { SeedCtx } from '@/lib/seed-types'
import { bumpSeq, formatSeq, prefixFrom } from '@/lib/sequence'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { CompOff } from '@/models/muster/CompOff'
import { Department } from '@/models/muster/Department'
import { Designation } from '@/models/muster/Designation'
import { Employee } from '@/models/muster/Employee'
import { Holiday } from '@/models/muster/Holiday'
import { LeaveBalance } from '@/models/muster/LeaveBalance'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { LeaveType } from '@/models/muster/LeaveType'
import { MusterPolicy } from '@/models/muster/Policy'
import { leaveDates, unpaidDatesOf } from './leave/days'
import { bankFor, DEPARTMENTS, DESIGNATIONS, HOLIDAYS_2026, PEOPLE, type SeedPerson } from './people/seed-data'
import { seed as seedMusterB } from './seed-b'
import { seedOnboarding } from './seed-onboarding'
import { STANDARD_LEAVE_TYPES } from './settings/defaults'

type Id = Types.ObjectId
const LOCKED_MONTH = { year: 2026, month: 9, period: '2026-09', start: '2026-09-01', end: '2026-09-30' }
const OPENING_PL: [string, number][] = [['owner', 6], ['admin', 4.5], ['hr_admin', 5], ['finance', 3], ['manager', 6], ['ishaan', 4], ['meera', 5.5], ['pooja', 3]]
const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@flowbit.test`

/** Seeds Muster's people, attendance and leave for the demo workspace. Muster-b's part (./seed-b) follows. */
export async function seed(ctx: SeedCtx): Promise<void> {
  await ctx.db(MusterPolicy).create({})
  const departments = await ctx.db(Department).insertMany(DEPARTMENTS)
  const designations = await ctx.db(Designation).insertMany(DESIGNATIONS.map((title) => ({ title })))
  const deptId = new Map(departments.map((d) => [d.code, d._id as Id]))
  const desigId = new Map(designations.map((d) => [d.title, d._id as Id]))

  const users = await User.find({ _id: { $in: ctx.allMembers.map((m) => m.userId) } }, { name: 1, email: 1 }).lean()
  const memberOf = (p: SeedPerson) => {
    if (p.role) return ctx.members[p.role as keyof SeedCtx['members']]
    const user = users.find((u) => u.name === p.name)
    return user ? ctx.allMembers.find((m) => String(m.userId) === String(user._id)) : undefined
  }
  const emailOf = (p: SeedPerson) => {
    const member = memberOf(p)
    return users.find((u) => member && String(u._id) === String(member.userId))?.email ?? p.email ?? emailFor(p.name)
  }

  const prefix = prefixFrom(ctx.org.name)
  const employees = await ctx.db(Employee).insertMany(
    PEOPLE.map((p, i) => {
      const [firstName, ...rest] = p.name.split(' ')
      const email = emailOf(p)
      return {
        code: formatSeq(i + 1, { prefix: `${prefix}-`, pad: 4 }), memberId: memberOf(p)?._id, firstName, lastName: rest.join(' '), fullName: p.name, workEmail: email, workEmailLower: email.toLowerCase(),
        personalEmail: `${firstName.toLowerCase()}.${(rest[0] ?? 'x').toLowerCase()}@gmail.com`, phone: p.phone, gender: p.gender, dob: p.dob,
        departmentId: deptId.get(p.dept), designationId: desigId.get(p.title), designation: p.title, employmentType: p.type, status: p.status, joinDate: p.join,
        exitDate: p.exit, exitReason: p.exitReason, resignationDate: p.resignation, workLocation: p.city, ptState: p.city === 'Indore' || p.city === 'Bhopal' ? 'MP' : undefined,
        statutory: { pfCovered: Boolean(p.pf), esiCovered: false, ptExempt: false }, pan: p.pan, uan: p.pf ? `1009${String(87654321 + i * 1013).slice(0, 8)}` : undefined,
        bank: p.bank ? bankFor(p.name, i) : {}, address: { text: `${12 + i}, ${['Vijay Nagar', 'Palasia', 'Arera Colony', 'Koregaon Park', 'Banjara Hills'][i % 5]}, ${p.city}` },
        emergencyContact: { name: `${['Rakesh', 'Sunita', 'Mahesh', 'Lata'][i % 4]} ${rest.join(' ')}`, phone: `98${String(30000000 + i * 7771).padStart(8, '0')}`, relation: ['Father', 'Mother', 'Spouse', 'Brother'][i % 4] },
      }
    }),
  )
  await bumpSeq(ctx.orgId, 'employee', PEOPLE.length)
  const inserted = new Map(PEOPLE.map((p, i) => [p.key, employees[i]._id as Id]))
  await Promise.all(PEOPLE.filter((p) => p.manager).map((p) => ctx.db(Employee).updateOne({ _id: inserted.get(p.key) }, { $set: { managerId: inserted.get(p.manager!) } })))
  const fresh = await ctx.db(Employee).find({}, { fullName: 1, memberId: 1, managerId: 1 }).lean()
  const byKey: Lookup = new Map(PEOPLE.map((p) => [p.key, fresh.find((e) => String(e._id) === String(inserted.get(p.key)))!]))
  for (const e of employees.filter((x) => x.memberId)) {
    await ctx.db(Member).updateOne({ _id: e.memberId }, { $set: { employeeId: e._id } })
    await ctx.db(AttendanceDay).updateMany({ memberId: e.memberId }, { $set: { employeeId: e._id } })
  }
  ctx.log(`employees: ${employees.length} (${employees.filter((e) => e.memberId).length} linked to logins)`)

  await ctx.db(Holiday).insertMany(HOLIDAYS_2026.map((h) => ({ ...h, isOptional: Boolean(h.isOptional) })))
  const holidays = HOLIDAYS_2026.filter((h) => !h.isOptional).map((h) => h.date)
  const workWeek = ctx.org.workWeek?.length ? ctx.org.workWeek : [1, 2, 3, 4, 5, 6]
  const types = await ctx.db(LeaveType).insertMany(STANDARD_LEAVE_TYPES.map((t) => ({ ...t, isActive: true })))
  const type = (code: string) => types.find((t) => t.code === code)!

  await ctx.db(LeaveBalance).insertMany(
    OPENING_PL.map(([key, days]) => ({
      employeeId: byKey.get(key)!._id, leaveTypeId: type('PL')._id, leaveYear: '2026-27', kind: 'opening' as const, days, reason: 'Carried forward from 2025-26 (old system)', createdBy: ctx.users.hr_admin._id, createdByName: ctx.users.hr_admin.name,
    })),
  )

  await seedLeave(ctx, byKey, type, { workWeek, holidays })
  await seedAttendance(ctx, byKey, workWeek)
  ctx.log('muster-a: departments, holidays, leave types, balances, requests, September locked')
  await seedOnboarding(ctx)

  await seedMusterB(ctx)
}

type LeavePlan = { who: string; code: string; start: string; end: string; status: 'approved' | 'rejected' | 'pending'; reason: string; done: string[]; paid: number; note?: string }
type EmployeeRow = { _id: Id; memberId?: Id | null; managerId?: Id | null; fullName: string }
type Lookup = Map<string, EmployeeRow>

/** The User behind a member (who raised a request), if any. */
const userOf = (ctx: SeedCtx, memberId?: Id | null) => (memberId ? ctx.allMembers.find((m) => String(m._id) === String(memberId))?.userId : undefined)

async function seedLeave(ctx: SeedCtx, byKey: Lookup, type: (code: string) => { _id: Id; code: string; name: string }, cal: { workWeek: number[]; holidays: string[] }) {
  const hr = { decidedBy: ctx.users.hr_admin._id, decidedByName: ctx.users.hr_admin.name }
  const mgr = { decidedBy: ctx.users.manager._id, decidedByName: ctx.users.manager.name }
  const plan: LeavePlan[] = [
    { who: 'member', code: 'PL', start: '2026-09-10', end: '2026-09-11', status: 'approved', reason: 'Sister’s wedding in Ujjain', done: ['manager', 'hr'], paid: 2 },
    { who: 'harsh', code: 'PL', start: '2026-09-14', end: '2026-09-15', status: 'approved', reason: 'Family function', done: ['manager', 'hr'], paid: 2 },
    { who: 'meera', code: 'SL', start: '2026-10-05', end: '2026-10-05', status: 'approved', reason: 'Dental surgery', done: ['manager', 'hr'], paid: 1 },
    { who: 'karan', code: 'PL', start: '2026-09-25', end: '2026-09-25', status: 'rejected', reason: 'Personal work', done: [], paid: 1, note: 'Campaign launch that day. Please pick another date.' },
    { who: 'ishaan', code: 'PL', start: '2026-10-14', end: '2026-10-16', status: 'pending', reason: 'Trip to Goa with family', done: [], paid: 3 },
    { who: 'siddharth', code: 'PL', start: '2026-10-21', end: '2026-10-23', status: 'pending', reason: 'Going home for Dussehra', done: [], paid: 0 },
    { who: 'pooja', code: 'PL', start: '2026-10-26', end: '2026-10-27', status: 'pending', reason: 'Moving house', done: ['manager'], paid: 2 },
  ]
  for (const l of plan) {
    const e = byKey.get(l.who)!
    const t = type(l.code)
    const dates = leaveDates(l.start, l.end, cal)
    const decisions = [
      ...l.done.map((stage) => ({ stage, decision: 'approved' as const, ...(stage === 'manager' ? mgr : hr), decidedAt: istInstant(addDays(l.start, -3), '11:00') })),
      ...(l.status === 'rejected' ? [{ stage: 'manager', decision: 'rejected' as const, ...mgr, note: l.note, decidedAt: istInstant(addDays(l.start, -2), '15:30') }] : []),
    ]
    await ctx.db(LeaveRequest).create({
      employeeId: e._id, leaveTypeId: t._id, leaveCode: t.code, leaveName: t.name, startDate: l.start, endDate: l.end, isHalfDay: false, dayCount: dates.length,
      paidDays: Math.min(l.paid, dates.length), unpaidDays: dates.length - Math.min(l.paid, dates.length), dates, unpaidDates: unpaidDatesOf(dates, l.paid, false), reason: l.reason, status: l.status,
      stages: ['manager', 'hr'], completedStages: l.done, decisions, managerId: e.managerId, raisedBy: userOf(ctx, e.memberId), raisedByName: e.fullName,
      decidedAt: l.status === 'pending' ? undefined : decisions.at(-1)?.decidedAt, decisionNote: l.note,
    })
    if (l.status === 'approved' && e.memberId) await ctx.db(AttendanceDay).updateMany({ memberId: e.memberId, date: { $in: dates } }, { $set: { status: 'leave', note: `${t.name} (approved)` } })
  }
}

async function seedAttendance(ctx: SeedCtx, byKey: Lookup, workWeek: number[]) {
  const hrSigner = { decidedBy: ctx.users.hr_admin._id, decidedByName: ctx.users.hr_admin.name, decidedAt: istInstant('2026-09-23', '10:15') }
  const overrides = [
    { who: 'tanvi', date: '2026-09-22', status: 'absent', reason: 'Did not come in and did not call' },
    { who: 'harsh', date: '2026-09-18', status: 'on_duty', reason: 'Client site visit at Nimbus Fintech' },
    { who: 'member', date: '2026-09-08', status: 'present', reason: 'Forgot to check in; was at his desk all day' },
    // Work from home, sick leave and half days, in September and this month.
    { who: 'karan', date: '2026-09-24', status: 'work_from_home', reason: 'Plumbing work at home; joined every call' },
    { who: 'sneha', date: '2026-09-29', status: 'sick_leave', reason: 'Viral fever' },
    { who: 'pooja', date: '2026-09-30', status: 'paid_half_day', reason: 'Bank work in the afternoon, half a day of paid leave' },
    { who: 'ishaan', date: '2026-10-01', status: 'work_from_home', reason: 'Waiting for an internet installation at home' },
    { who: 'ananya', date: '2026-10-01', status: 'sick_leave', reason: 'Migraine' },
    { who: 'harsh', date: '2026-10-01', status: 'half_day', reason: 'Left at 2 pm, unpaid half day as agreed' },
    { who: 'meera', date: '2026-10-01', status: 'work_from_home', reason: 'Designs for the Nimbus pitch, working from home' },
    { who: 'tanvi', date: '2026-10-01', status: 'paid_half_day', reason: 'College exam in the morning' },
  ]
  for (const o of overrides) {
    const e = byKey.get(o.who)!
    await ctx.db(AttendanceCorrection).create({
      employeeId: e._id, memberId: e.memberId, date: o.date, kind: 'override', source: o.date >= '2026-10-01' ? 'daily' : 'register', requestedStatus: o.status, reason: o.reason, status: 'approved',
      stages: ['hr'], completedStages: ['hr'], decisions: [{ stage: 'hr', decision: 'approved', ...hrSigner, note: o.reason }], raisedBy: ctx.users.hr_admin._id, raisedByName: ctx.users.hr_admin.name, decidedAt: hrSigner.decidedAt,
    })
    if (e.memberId) await ctx.db(AttendanceDay).updateOne({ memberId: e.memberId, date: o.date }, { $set: { status: o.status, note: o.reason, correctedBy: ctx.users.hr_admin._id } })
  }

  // Ananya worked Sunday 27 Sep for a launch and claims a comp-off.
  const ananya = byKey.get('ananya')!
  if (ananya.memberId) {
    const punches = [{ type: 'in', at: istInstant('2026-09-27', '10:05'), source: 'web' }, { type: 'out', at: istInstant('2026-09-27', '16:40'), source: 'web' }]
    await ctx.db(AttendanceDay).updateOne({ memberId: ananya.memberId, date: '2026-09-27' }, { $set: { punches, status: 'present', workedMinutes: 395, breakMinutes: 0, employeeId: ananya._id } }, { upsert: true })
  }
  await ctx.db(CompOff).create({ employeeId: ananya._id, workedOn: '2026-09-27', days: 1, reason: 'Festive campaign launch', expiresOn: addDays('2026-09-27', 90), status: 'pending', stages: ['manager', 'hr'], completedStages: [], managerId: ananya.managerId, raisedBy: userOf(ctx, ananya.memberId), raisedByName: ananya.fullName })

  const vikram = byKey.get('member')!
  await ctx.db(AttendanceCorrection).create({
    employeeId: vikram._id, memberId: vikram.memberId, date: '2026-10-01', kind: 'request', currentStatus: 'absent', requestedStatus: 'on_duty', reason: 'At the Sharma Organics office for the website handover all day',
    status: 'pending', stages: ['manager', 'hr'], completedStages: [], managerId: vikram.managerId, raisedBy: userOf(ctx, vikram.memberId), raisedByName: vikram.fullName,
  })

  await ctx.db(AttendancePeriod).create({ ...LOCKED_MONTH, status: 'locked', workingDays: eachDay(LOCKED_MONTH.start, LOCKED_MONTH.end).filter((d) => workWeek.includes(weekday(d))).length, headcount: PEOPLE.filter((p) => p.join <= LOCKED_MONTH.end && (!p.exit || p.exit >= LOCKED_MONTH.start)).length, lockedBy: ctx.users.hr_admin._id, lockedByName: ctx.users.hr_admin.name, lockedAt: istInstant('2026-10-01', '10:30') })
  await ctx.db(AttendanceDay).updateMany({ date: { $gte: LOCKED_MONTH.start, $lte: LOCKED_MONTH.end } }, { $set: { locked: true } })
}
