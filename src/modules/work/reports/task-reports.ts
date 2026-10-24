import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { daysBetween, isoDateIST, todayIST } from '@/lib/dates'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TimeEntry } from '@/models/work/TimeEntry'
import { listPeople, peopleMap } from '../teams/people'
import { AGING, agingKey, avgCycleDays, bucketOf, buckets, onTimePercent } from './range'
import { instantRange, resolveScope, type ReportScope } from './scope'
import { canAccessProject } from '../projects/access'
import { reportTimeFilter } from './time-filter'

type Range = { from: string; to: string }

export async function throughputReport(ctx: Ctx, range: Range, scope: ReportScope) {
  const { task } = await resolveScope(ctx, scope)
  const window = instantRange(range)
  const [created, completed] = await Promise.all([
    ctx.db(Task).find({ ...task, createdAt: window }, { createdAt: 1 }).lean(),
    ctx.db(Task).find({ ...task, completedAt: window }, { completedAt: 1, startedAt: 1, createdAt: 1 }).lean(),
  ])
  const list = buckets(range)
  const createdSeries = list.map(() => 0)
  const completedSeries = list.map(() => 0)
  for (const t of created) {
    const i = bucketOf(list, isoDateIST(t.createdAt))
    if (i >= 0) createdSeries[i] += 1
  }
  for (const t of completed) {
    if (!t.completedAt) continue
    const i = bucketOf(list, isoDateIST(t.completedAt))
    if (i >= 0) completedSeries[i] += 1
  }
  const cycle = avgCycleDays(completed.filter((t) => t.completedAt).map((t) => ({ completedAt: t.completedAt as Date, startedAt: t.startedAt, createdAt: t.createdAt })))
  return {
    labels: list.map((b) => b.label),
    rows: list.map((b, i) => ({ date: b.from, label: b.label, created: createdSeries[i], completed: completedSeries[i] })),
    created: createdSeries,
    completed: completedSeries,
    totals: { created: created.length, completed: completed.length, cycleDays: cycle },
  }
}

export async function overdueReport(ctx: Ctx, scope: ReportScope) {
  const { task } = await resolveScope(ctx, scope)
  const today = todayIST()
  const rows = await ctx.db(Task).find({ ...task, status: { $ne: 'done' }, dueDate: { $lt: today, $ne: null } }, { key: 1, title: 1, projectId: 1, assigneeIds: 1, dueDate: 1, priority: 1 }).sort({ dueDate: 1 }).limit(500).lean()
  const [people, projects] = await Promise.all([
    peopleMap(ctx, rows.flatMap((r) => r.assigneeIds)),
    ctx.db(Project).find({ _id: { $in: rows.flatMap((r) => (r.projectId ? [r.projectId] : [])) } }, { name: 1 }).lean(),
  ])
  const projectName = (id: unknown) => (id ? (projects.find((p) => String(p._id) === String(id))?.name ?? 'Removed project') : 'No project')
  const table = rows.map((r) => {
    const days = daysBetween(r.dueDate as string, today)
    return { id: String(r._id), key: r.key, title: r.title, project: projectName(r.projectId), assignees: r.assigneeIds.map((a) => people.get(String(a))?.name ?? 'Former member'), dueDate: r.dueDate as string, days, priority: r.priority, aging: agingKey(days) }
  })
  const countBy = (keyOf: (r: (typeof table)[number]) => string[]) => {
    const map = new Map<string, number>()
    for (const r of table) for (const k of keyOf(r)) map.set(k, (map.get(k) ?? 0) + 1)
    return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  }
  return {
    table,
    aging: AGING.map((a) => ({ label: a.label, count: table.filter((r) => r.aging === a.key).length })),
    byAssignee: countBy((r) => r.assignees),
    byProject: countBy((r) => [r.project]),
  }
}

export async function assigneeReport(ctx: Ctx, range: Range, scope: ReportScope, approvedOnly = false) {
  const { task, memberIds } = await resolveScope(ctx, scope)
  const everyone = await listPeople(ctx)
  const members = memberIds ? everyone.filter((p) => memberIds.includes(p.id)) : everyone
  const ids = members.map((m) => m.id)
  const today = todayIST()
  const [open, completed, time] = await Promise.all([
    ctx.db(Task).find({ ...task, assigneeIds: { $in: ids }, status: { $ne: 'done' } }, { assigneeIds: 1, dueDate: 1 }).lean(),
    ctx.db(Task).find({ ...task, assigneeIds: { $in: ids }, completedAt: instantRange(range) }, { assigneeIds: 1, dueDate: 1, completedAt: 1, startedAt: 1, createdAt: 1, estimateMinutes: 1 }).lean(),
    ctx.db(TimeEntry).find({ memberId: { $in: ids }, date: { $gte: range.from, $lte: range.to }, ...reportTimeFilter(approvedOnly), ...(scope.projectId ? { projectId: scope.projectId } : {}) }, { memberId: 1, minutes: 1 }).lean(),
  ])
  // Actual time per finished task from its entries (Task.loggedMinutes also counts rejected time).
  const estimatedIds = completed.filter((t) => (t.estimateMinutes ?? 0) > 0).map((t) => t._id)
  const actualRows = estimatedIds.length
    ? await ctx.db(TimeEntry).aggregate<{ _id: unknown; minutes: number }>([{ $match: { taskId: { $in: estimatedIds }, ...reportTimeFilter(approvedOnly) } }, { $group: { _id: '$taskId', minutes: { $sum: '$minutes' } } }])
    : []
  const actualOf = (id: unknown) => actualRows.find((r) => String(r._id) === String(id))?.minutes ?? 0
  return members.map((m) => {
    const has = (t: { assigneeIds: unknown[] }) => t.assigneeIds.some((a) => String(a) === m.id)
    const mine = open.filter(has)
    const done = completed.filter(has).filter((t) => t.completedAt)
    const estimated = done.filter((t) => (t.estimateMinutes ?? 0) > 0)
    const estimate = estimated.reduce((s, t) => s + (t.estimateMinutes ?? 0), 0)
    const actual = estimated.reduce((s, t) => s + actualOf(t._id), 0)
    return {
      id: m.id,
      name: m.name,
      open: mine.length,
      completed: done.length,
      overdue: mine.filter((t) => t.dueDate && t.dueDate < today).length,
      onTime: onTimePercent(done.map((t) => ({ completedDay: isoDateIST(t.completedAt as Date), dueDate: t.dueDate }))),
      cycleDays: avgCycleDays(done.map((t) => ({ completedAt: t.completedAt as Date, startedAt: t.startedAt, createdAt: t.createdAt }))),
      loggedMinutes: time.filter((e) => String(e.memberId) === m.id).reduce((s, e) => s + e.minutes, 0),
      variance: estimate > 0 ? Math.round(((actual - estimate) / estimate) * 100) : null,
    }
  })
}

export async function projectHealthReport(ctx: Ctx, range: Range, scope: ReportScope, approvedOnly = false) {
  const projects = await ctx.db(Project).find({ archivedAt: null, status: { $ne: 'cancelled' }, ...(scope.projectId ? { _id: scope.projectId } : {}) }).sort({ name: 1 }).lean()
  const ids = projects.map((p) => p._id)
  const today = todayIST()
  const [stats, time, people] = await Promise.all([
    ctx.db(Task).aggregate<{ _id: unknown; total: number; done: number; overdue: number; blocked: number }>([
      { $match: { projectId: { $in: ids }, isPersonal: { $ne: true } } },
      { $group: { _id: '$projectId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } }, blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'done'] }, { $gt: ['$dueDate', null] }, { $lt: ['$dueDate', today] }] }, 1, 0] } } } },
    ]),
    ctx.db(TimeEntry).aggregate<{ _id: unknown; minutes: number }>([{ $match: { projectId: { $in: ids }, date: { $gte: range.from, $lte: range.to }, ...reportTimeFilter(approvedOnly) } }, { $group: { _id: '$projectId', minutes: { $sum: '$minutes' } } }]),
    peopleMap(ctx, projects.flatMap((p) => (p.leadId ? [p.leadId] : []))),
  ])
  return projects.map((p) => {
    const s = stats.find((x) => String(x._id) === String(p._id)) ?? { total: 0, done: 0, overdue: 0, blocked: 0 }
    const completion = s.total ? Math.round((s.done / s.total) * 100) : 0
    const span = p.startDate && p.endDate ? daysBetween(p.startDate, p.endDate) : 0
    const timeline = span > 0 && p.startDate ? Math.min(100, Math.max(0, Math.round((daysBetween(p.startDate, today) / span) * 100))) : null
    return {
      id: String(p._id),
      code: p.code,
      name: p.name,
      /** Whether this viewer can open the project page (reports see every project; the page follows A5.2). */
      canOpen: canAccessProject(String(ctx.memberId), ctx.can('projects.write'), p),
      lead: p.leadId ? (people.get(String(p.leadId))?.name ?? 'Former member') : '—',
      status: p.status,
      health: p.health ?? 'on_track',
      score: p.healthScore ?? null,
      completion,
      open: s.total - s.done,
      overdue: s.overdue,
      blocked: s.blocked,
      timeline,
      gap: timeline === null ? null : completion - timeline,
      daysLeft: p.endDate ? daysBetween(today, p.endDate) : null,
      loggedMinutes: time.find((t) => String(t._id) === String(p._id))?.minutes ?? 0,
    }
  })
}
