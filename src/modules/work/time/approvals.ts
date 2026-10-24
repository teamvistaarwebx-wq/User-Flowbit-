import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { TimeEntry } from '@/models/work/TimeEntry'
import { Timesheet } from '@/models/work/Timesheet'
import { peopleMap, nameOf } from '../teams/people'
import { labelTargets, targetKeyOf } from './targets'

export const APPROVAL_TABS = ['submitted', 'approved', 'rejected'] as const
export type ApprovalTab = (typeof APPROVAL_TABS)[number]
const LIMIT = 50

/**
 * Whose timesheets a time.approve holder decides: the ones routed to them
 * (their direct reports). Owners and admins (org.manage) see every sheet,
 * including those with no approver.
 */
export const approvalScope = (ctx: Ctx): Record<string, unknown> => (ctx.can('org.manage') ? {} : { approverId: ctx.memberId })

export type ApprovalSheet = {
  id: string
  member: string
  memberId: string
  isMine: boolean
  weekStart: string
  status: string
  total: number
  billable: number
  submittedAt?: string
  decidedBy?: string
  reason?: string
  entries: { id: string; date: string; label: string; minutes: number; note: string; billable: boolean }[]
}

/** Timesheets in a status (newest weeks first) with their entries for the expandable rows. */
export async function approvalSheets(ctx: Ctx, status: ApprovalTab): Promise<{ sheets: ApprovalSheet[]; counts: Record<ApprovalTab, number> }> {
  const [sheets, ...countList] = await Promise.all([
    ctx.db(Timesheet).find({ status, ...approvalScope(ctx) }).sort({ weekStart: -1, submittedAt: 1 }).limit(LIMIT).lean(),
    ...APPROVAL_TABS.map((s) => ctx.db(Timesheet).countDocuments({ status: s, ...approvalScope(ctx) })),
  ])
  const counts = Object.fromEntries(APPROVAL_TABS.map((s, i) => [s, countList[i]])) as Record<ApprovalTab, number>
  if (!sheets.length) return { sheets: [], counts }
  const entries = await ctx.db(TimeEntry).find({ $or: sheets.map((s) => ({ memberId: s.memberId, weekStart: s.weekStart })) }).sort({ date: 1 }).lean()
  const [labels, people] = await Promise.all([labelTargets(ctx, entries), peopleMap(ctx, [...sheets.map((s) => s.memberId), ...sheets.flatMap((s) => (s.decidedById ? [s.decidedById] : []))])])
  return {
    counts,
    sheets: sheets.map((s) => ({
      id: String(s._id),
      member: nameOf(people, s.memberId),
      memberId: String(s.memberId),
      isMine: String(s.memberId) === String(ctx.memberId),
      weekStart: s.weekStart,
      status: s.status,
      total: s.totalMinutes,
      billable: s.billableMinutes,
      submittedAt: s.submittedAt?.toISOString(),
      decidedBy: s.decidedById ? nameOf(people, s.decidedById) : undefined,
      reason: s.reason ?? undefined,
      entries: entries
        .filter((e) => String(e.memberId) === String(s.memberId) && e.weekStart === s.weekStart)
        .map((e) => ({ id: String(e._id), date: e.date, label: labels.get(targetKeyOf(e))?.label ?? 'Removed item', minutes: e.minutes, note: e.note ?? '', billable: e.billable })),
    })),
  }
}
