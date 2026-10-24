import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, dayBoundsIST, formatDate, formatDuration, formatTime, startOfWeek, weekday } from '@/lib/dates'
import { pluralize } from '@/lib/utils'
import { Meeting } from '@/models/work/Meeting'
import { Task } from '@/models/work/Task'
import { Timesheet } from '@/models/work/Timesheet'
import { daysOverdue } from '@/modules/work/tasks/due'
import type { BriefLine, BuiltSection } from './schedule'

/** Work sections of a brief: the person's own tasks (with their filters), meetings and timesheet. */

export const LINES_PER_SECTION = 8

export type BriefFilters = Readonly<{ projectIds: readonly string[]; priorities: readonly string[]; tags: readonly string[]; scope: 'assigned' | 'created' | 'watching' }>

const mine = (ctx: Ctx, f: BriefFilters) => (f.scope === 'created' ? { creatorId: ctx.memberId } : f.scope === 'watching' ? { watcherIds: ctx.memberId } : { assigneeIds: ctx.memberId })

const narrowed = (f: BriefFilters) => ({
  ...(f.priorities.length ? { priority: { $in: [...f.priorities] } } : {}),
  ...(f.projectIds.length ? { projectId: { $in: [...f.projectIds] } } : {}),
  ...(f.tags.length ? { tags: { $in: [...f.tags] } } : {}),
})

type TaskRow = { _id: unknown; title: string; dueDate?: string | null; priority?: string | null }

const taskLine = (t: TaskRow, meta?: string): BriefLine => ({ text: t.title, href: `/app/work/tasks/${String(t._id)}`, meta })

async function tasks(ctx: Ctx, f: BriefFilters, due: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<TaskRow[]> {
  return ctx.db(Task).find({ ...mine(ctx, f), ...narrowed(f), status: { $ne: 'done' }, ...(Object.keys(due).length ? { dueDate: due } : {}), ...extra }, { title: 1, dueDate: 1, priority: 1 }).sort({ dueDate: 1 }).limit(LINES_PER_SECTION).lean()
}

export async function dueToday(ctx: Ctx, f: BriefFilters, today: string): Promise<BuiltSection> {
  const rows = await tasks(ctx, f, { $eq: today })
  return { key: 'work.due_today', title: 'Due today', lines: rows.map((t) => taskLine(t, t.priority === 'urgent' || t.priority === 'high' ? t.priority : undefined)), summary: rows.length ? `${rows.length} due today` : undefined, href: '/app/work/tasks' }
}

export async function overdue(ctx: Ctx, f: BriefFilters, today: string): Promise<BuiltSection> {
  const rows = await tasks(ctx, f, { $lt: today, $gte: addDays(today, -90) })
  return { key: 'work.overdue', title: 'Overdue', lines: rows.map((t) => taskLine(t, `${pluralize(daysOverdue(t.dueDate, today), 'day')} late`)), summary: rows.length ? `${rows.length} overdue` : undefined, href: '/app/work/tasks' }
}

export async function dueThisWeek(ctx: Ctx, f: BriefFilters, today: string): Promise<BuiltSection> {
  const rows = await tasks(ctx, f, { $gt: today, $lte: addDays(today, 7) })
  return { key: 'work.due_week', title: 'Due this week', lines: rows.map((t) => taskLine(t, t.dueDate ? `Due ${formatDate(t.dueDate, { short: true })}` : undefined)), summary: rows.length ? `${rows.length} due this week` : undefined }
}

export async function blocked(ctx: Ctx, f: BriefFilters): Promise<BuiltSection> {
  const rows = await ctx.db(Task).find({ ...mine(ctx, f), ...narrowed(f), status: 'blocked' }, { title: 1, blockedReason: 1 }).limit(LINES_PER_SECTION).lean()
  return { key: 'work.blocked', title: 'Blocked', lines: rows.map((t) => ({ text: t.title, href: `/app/work/tasks/${String(t._id)}`, meta: t.blockedReason ?? undefined })), summary: rows.length ? `${rows.length} blocked` : undefined }
}

export async function meetingsToday(ctx: Ctx, today: string): Promise<BuiltSection> {
  const { start, end } = dayBoundsIST(today)
  const rows = await ctx.db(Meeting).find({ 'attendees.memberId': ctx.memberId, status: 'scheduled', startAt: { $gte: start, $lt: end } }, { title: 1, startAt: 1 }).sort({ startAt: 1 }).limit(LINES_PER_SECTION).lean()
  return { key: 'work.meetings', title: "Today's meetings", lines: rows.map((m) => ({ text: m.title, href: `/app/work/meetings/${String(m._id)}`, meta: formatTime(m.startAt) })), summary: rows.length ? pluralize(rows.length, 'meeting') : undefined }
}

/** Only says something when the timesheet needs action: sent back, or still a draft from Thursday on. */
export async function timesheet(ctx: Ctx, today: string): Promise<BuiltSection> {
  const sheet = await ctx.db(Timesheet).findOne({ memberId: ctx.memberId, weekStart: startOfWeek(today) }, { status: 1, totalMinutes: 1, reason: 1 }).lean()
  const lateInWeek = weekday(today) >= 4 || weekday(today) === 0
  const lines: BriefLine[] =
    sheet?.status === 'rejected'
      ? [{ text: 'Your timesheet was sent back', href: '/app/work/time', meta: sheet.reason ?? undefined }]
      : (!sheet || sheet.status === 'draft') && lateInWeek
        ? [{ text: `This week: ${formatDuration(sheet?.totalMinutes ?? 0)} logged, not submitted yet`, href: '/app/work/time' }]
        : []
  return { key: 'work.timesheet', title: 'My timesheet', lines, summary: lines.length ? 'timesheet to submit' : undefined }
}
