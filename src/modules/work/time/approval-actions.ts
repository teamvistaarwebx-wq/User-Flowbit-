'use server'

import type { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { formatDuration } from '@/lib/dates'
import { notifyMembers, notifyPermission } from '@/lib/notify'
import { resolvePermissions } from '@/lib/permissions'
import { isoDate, objectId } from '@/lib/validation'
import { Member } from '@/models/Member'
import { Role } from '@/models/Role'
import { Employee } from '@/models/muster/Employee'
import { TimeEntry } from '@/models/work/TimeEntry'
import { Timesheet } from '@/models/work/Timesheet'
import { decideTimesheet, refreshTime, TIMESHEET_DECIDE_OPTS } from './decide'
import { syncWeek } from './ledger'
import { submitProblem, weekLabel } from './week'

const refresh = refreshTime

/**
 * The member who approves my time: for a member linked to an employee record,
 * that record's reporting manager's login (Employee.managerId is the source of
 * truth, FOUNDATION §0); otherwise Member.managerId.
 */
async function reportingManagerOf(ctx: Ctx): Promise<Types.ObjectId | null> {
  if (!ctx.member.employeeId) return ctx.member.managerId ?? null
  const employee = await ctx.db(Employee).findById(ctx.member.employeeId, { managerId: 1 }).lean()
  if (!employee?.managerId) return null
  const manager = await ctx.db(Employee).findById(employee.managerId, { memberId: 1 }).lean()
  return manager?.memberId ?? null
}

/**
 * The manager approves only when their login is active and their role holds
 * time.approve; otherwise (null) the sheet goes to owners and admins, as when
 * no manager is on record.
 */
async function approverOf(ctx: Ctx): Promise<Types.ObjectId | null> {
  const managerId = await reportingManagerOf(ctx)
  if (!managerId || String(managerId) === String(ctx.memberId)) return null
  const manager = await ctx.db(Member).findOne({ _id: managerId, status: 'active' }, { role: 1 }).lean()
  if (!manager) return null
  const customRoles = await ctx.db(Role).find({ builtIn: false }).lean()
  return resolvePermissions(manager.role, customRoles).has('time.approve') ? managerId : null
}

export const submitWeek = action(
  z.object({ weekStart: isoDate }),
  async ({ weekStart }, ctx) => {
    await syncWeek(ctx, ctx.memberId, weekStart)
    const [sheet, running] = await Promise.all([
      ctx.db(Timesheet).findOne({ memberId: ctx.memberId, weekStart }).lean(),
      ctx.db(TimeEntry).exists({ memberId: ctx.memberId, isRunning: true, weekStart }),
    ])
    const problem = submitProblem({ status: sheet?.status, totalMinutes: sheet?.totalMinutes ?? 0, hasRunningTimer: Boolean(running) })
    if (problem || !sheet) return fail(problem ?? 'Log some time before submitting.')
    const approverId = (await approverOf(ctx)) ?? undefined
    await ctx.db(Timesheet).updateOne({ _id: sheet._id }, { $set: { status: 'submitted', submittedAt: new Date(), approverId }, $unset: { reason: 1, decidedAt: 1, decidedById: 1 } })
    await ctx.db(TimeEntry).updateMany({ memberId: ctx.memberId, weekStart }, { $set: { status: 'submitted' } })
    const label = weekLabel(weekStart)
    const note = { title: `${ctx.user.name} submitted ${label} (${formatDuration(sheet.totalMinutes)})`, href: '/app/work/time/approvals', kind: 'approval' as const, product: 'work', event: 'timesheet.submitted', action: { kind: 'timesheet' as const, id: String(sheet._id) } }
    if (approverId) await notifyMembers(ctx, [approverId], note)
    // No manager on record: owners and admins approve it (approvalScope).
    else await notifyPermission(ctx, 'org.manage', note)
    refresh()
    return ok(`Timesheet for ${label} submitted`)
  },
  { product: 'work', perm: 'time.write' },
)

export const approveWeeks = action(
  z.object({ ids: z.array(objectId).min(1, 'Pick at least one timesheet').max(100) }),
  async ({ ids }, ctx) => {
    const results: Awaited<ReturnType<typeof decideTimesheet>>[] = []
    for (const id of ids) results.push(await decideTimesheet(ctx, id, 'approved'))
    refresh()
    const failed = results.filter((r) => !r.ok)
    if (ids.length === 1) return results[0]
    const firstFailure = failed[0]
    if (failed.length === ids.length) return fail(firstFailure && !firstFailure.ok ? firstFailure.error : 'Nothing was approved.')
    return ok(`Approved ${ids.length - failed.length} of ${ids.length} timesheets`)
  },
  TIMESHEET_DECIDE_OPTS,
)

export const rejectWeek = action(
  z.object({ id: objectId, reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500) }),
  async ({ id, reason }, ctx) => {
    const result = await decideTimesheet(ctx, id, 'rejected', reason)
    refresh()
    return result
  },
  TIMESHEET_DECIDE_OPTS,
)
