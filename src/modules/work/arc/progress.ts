import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, daysBetween, startOfWeek, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { Meeting } from '@/models/work/Meeting'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { Team } from '@/models/work/Team'
import { TimeEntry } from '@/models/work/TimeEntry'
import { canAccessProject, projectAccessMatch } from '../projects/access'
import { instantRange } from '../reports/scope'
import { weekLabel } from '../time/week'
import { taskVisibility } from './search'
import type { ProgressData } from './templates'
import type { MongoFilter } from '../reports/mongo-filter'

export type ProgressInput = { period: 'this_week' | 'last_week'; scope: 'me' | 'project' | 'team'; scopeId?: string }

/** Real numbers for the progress update; never invented. */
export async function progressData(ctx: Ctx, input: ProgressInput): Promise<ProgressData> {
  const today = todayIST()
  const monday = startOfWeek(today)
  const from = input.period === 'last_week' ? addDays(monday, -7) : monday
  const to = input.period === 'last_week' ? addDays(monday, -1) : today
  const window = instantRange({ from, to })
  const { filter, memberIds, scopeLabel } = await scopeFor(ctx, input)
  const visible = await taskVisibility(ctx)
  const timeScope = await timeVisibility(ctx, input)
  const base = { $and: [visible, filter, { isPersonal: { $ne: true } }] }
  const [completed, created, overdue, blocked, upcoming, time, meetings] = await Promise.all([
    ctx.db(Task).find({ ...base, completedAt: window }, { title: 1, projectId: 1 }).limit(200).lean(),
    ctx.db(Task).countDocuments({ ...base, createdAt: window }),
    ctx.db(Task).find({ ...base, status: { $ne: 'done' }, dueDate: { $lt: today, $ne: null } }, { title: 1, dueDate: 1 }).sort({ dueDate: 1 }).limit(20).lean(),
    ctx.db(Task).find({ ...base, status: 'blocked' }, { title: 1, blockedReason: 1 }).limit(20).lean(),
    ctx.db(Task).find({ ...base, status: { $ne: 'done' }, dueDate: { $gte: today, $lte: addDays(today, 7) } }, { title: 1, dueDate: 1 }).sort({ dueDate: 1 }).limit(20).lean(),
    ctx.db(TimeEntry).find({ date: { $gte: from, $lte: to }, isRunning: false, ...(memberIds ? { memberId: { $in: memberIds } } : {}), ...(input.scope === 'project' && input.scopeId ? { projectId: input.scopeId } : {}), ...timeScope }, { projectId: 1, minutes: 1 }).lean(),
    ctx.db(Meeting).countDocuments({ status: 'scheduled', startAt: window, ...(memberIds ? { 'attendees.memberId': { $in: memberIds } } : {}) }),
  ])
  const projectIds = [...new Set([...completed, ...time].flatMap((x) => (x.projectId ? [String(x.projectId)] : [])))]
  const projects = projectIds.length ? await ctx.db(Project).find({ _id: { $in: projectIds } }, { name: 1 }).lean() : []
  const name = (id: unknown) => (id ? (projects.find((p) => String(p._id) === String(id))?.name ?? 'Removed project') : 'No project')
  const group = <T,>(rows: T[], key: (r: T) => string) => rows.reduce((m, r) => m.set(key(r), [...(m.get(key(r)) ?? []), r]), new Map<string, T[]>())
  return {
    periodLabel: input.period === 'last_week' ? `Last week (${weekLabel(from)})` : `This week (${weekLabel(from)})`,
    scopeLabel,
    completed: [...group(completed, (t) => name(t.projectId)).entries()].map(([project, rows]) => ({ project, titles: rows.map((r) => r.title) })),
    created,
    overdue: overdue.map((t) => ({ title: t.title, days: daysBetween(t.dueDate as string, today) })),
    blocked: blocked.map((t) => ({ title: t.title, reason: t.blockedReason ?? undefined })),
    loggedByProject: [...group(time, (e) => name(e.projectId)).entries()].map(([project, rows]) => ({ project, minutes: rows.reduce((s, r) => s + r.minutes, 0) })).sort((a, b) => b.minutes - a.minutes),
    upcoming: upcoming.map((t) => ({ title: t.title, dueDate: t.dueDate as string })),
    meetings,
  }
}

/**
 * Other people's hours by project are report data: without work.reports a
 * team or project update counts only time on projects the viewer can open.
 */
async function timeVisibility(ctx: Ctx, input: ProgressInput): Promise<MongoFilter> {
  if (input.scope === 'me' || ctx.can('work.reports')) return {}
  const open = await ctx.db(Project).find(projectAccessMatch(String(ctx.memberId), ctx.can('projects.write')), { _id: 1 }).lean()
  return { projectId: { $in: open.map((p) => p._id) } }
}

async function scopeFor(ctx: Ctx, input: ProgressInput): Promise<{ filter: MongoFilter; memberIds?: string[]; scopeLabel: string }> {
  if (input.scope === 'project' && input.scopeId) {
    const project = await ctx.db(Project).findById(input.scopeId, { name: 1, leadId: 1, memberIds: 1, createdById: 1 }).lean()
    if (!project || !canAccessProject(String(ctx.memberId), ctx.can('projects.write'), project)) throw new NotFoundError('That project')
    return { filter: { projectId: input.scopeId }, scopeLabel: `the ${project.name} project` }
  }
  if (input.scope === 'team' && input.scopeId) {
    const team = await ctx.db(Team).findById(input.scopeId, { name: 1, members: 1 }).lean()
    const memberIds = team ? team.members.map((m) => String(m.memberId)) : []
    return { filter: { assigneeIds: { $in: memberIds } }, memberIds, scopeLabel: team ? `the ${team.name} team` : 'the team' }
  }
  return { filter: { assigneeIds: ctx.memberId }, memberIds: [String(ctx.memberId)], scopeLabel: 'you' }
}
