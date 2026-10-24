import 'server-only'
import { cache } from 'react'
import type { Ctx } from '@/lib/ctx'
import { addDays, todayIST } from '@/lib/dates'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { presenceFrom, type Presence } from './presence-core'

/** How far ahead leave is looked up for assignment warnings. */
export const LEAVE_LOOKAHEAD_DAYS = 90

/**
 * Approved leave days per member from today to LEAVE_LOOKAHEAD_DAYS ahead (Muster). Empty when
 * Muster has no employees. Cached per request; failures are logged and read as "no leave".
 */
export const upcomingLeave = cache(async (ctx: Ctx): Promise<Map<string, string[]>> => {
  const from = todayIST()
  const to = addDays(from, LEAVE_LOOKAHEAD_DAYS)
  try {
    const requests = await ctx.db(LeaveRequest).find({ status: 'approved', endDate: { $gte: from }, startDate: { $lte: to } }, { employeeId: 1, dates: 1 }).lean()
    if (!requests.length) return new Map()
    const employees = await ctx.db(Employee).find({ _id: { $in: requests.map((r) => r.employeeId) }, memberId: { $ne: null } }, { memberId: 1 }).lean()
    const memberOf = new Map(employees.map((e) => [String(e._id), String(e.memberId)]))
    return requests.reduce((map, r) => {
      const member = memberOf.get(String(r.employeeId))
      if (!member) return map
      const days = (r.dates ?? []).filter((d) => d >= from && d <= to)
      return new Map(map).set(member, [...new Set([...(map.get(member) ?? []), ...days])].sort())
    }, new Map<string, string[]>())
  } catch (error) {
    console.error('[work] could not read leave for presence', error)
    return new Map()
  }
})

/** Today's presence for each member: checked in, on break (with its type), on leave or offline. */
export async function presenceToday(ctx: Ctx, memberIds: string[]): Promise<Map<string, Presence>> {
  if (!memberIds.length) return new Map()
  const today = todayIST()
  const [days, leave] = await Promise.all([
    ctx.db(AttendanceDay).find({ memberId: { $in: memberIds }, date: today }, { memberId: 1, punches: 1, status: 1 }).lean(),
    upcomingLeave(ctx),
  ])
  const dayOf = new Map(days.map((d) => [String(d.memberId), d]))
  const now = new Date()
  return new Map(memberIds.map((id) => [id, presenceFrom(dayOf.get(id), (leave.get(id) ?? []).includes(today), now)]))
}
