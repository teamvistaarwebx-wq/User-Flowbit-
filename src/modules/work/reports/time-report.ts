import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TimeEntry } from '@/models/work/TimeEntry'
import { peopleMap } from '../teams/people'
import { resolveScope, type ReportScope } from './scope'
import { cutToLimit, reportTimeFilter, TIME_REPORT_LIMIT } from './time-filter'

/** Logged time in range by project (billable split) with member breakdown and entry detail for CSV. */
export async function timeReport(ctx: Ctx, range: { from: string; to: string }, scope: ReportScope, approvedOnly: boolean) {
  const { memberIds } = await resolveScope(ctx, scope)
  const read = await ctx.db(TimeEntry).find({
    date: { $gte: range.from, $lte: range.to },
    ...reportTimeFilter(approvedOnly),
    ...(memberIds ? { memberId: { $in: memberIds } } : {}),
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
  }).sort({ date: 1 }).limit(TIME_REPORT_LIMIT + 1).lean()
  const { rows: entries, truncated } = cutToLimit(read)
  const [projects, tasks, people] = await Promise.all([
    ctx.db(Project).find({ _id: { $in: [...new Set(entries.flatMap((e) => (e.projectId ? [String(e.projectId)] : [])))] } }, { name: 1, code: 1 }).lean(),
    ctx.db(Task).find({ _id: { $in: [...new Set(entries.flatMap((e) => (e.taskId ? [String(e.taskId)] : [])))] } }, { key: 1, title: 1 }).lean(),
    peopleMap(ctx, entries.map((e) => e.memberId)),
  ])
  const projectName = (id: unknown) => (id ? (projects.find((p) => String(p._id) === String(id))?.name ?? 'Removed project') : 'No project')
  const memberName = (id: unknown) => people.get(String(id))?.name ?? 'Former member'
  const byProject = new Map<string, { project: string; billable: number; nonBillable: number; members: Map<string, number> }>()
  for (const e of entries) {
    const key = e.projectId ? String(e.projectId) : 'none'
    const row = byProject.get(key) ?? { project: projectName(e.projectId), billable: 0, nonBillable: 0, members: new Map<string, number>() }
    if (e.billable) row.billable += e.minutes
    else row.nonBillable += e.minutes
    row.members.set(memberName(e.memberId), (row.members.get(memberName(e.memberId)) ?? 0) + e.minutes)
    byProject.set(key, row)
  }
  const rows = [...byProject.values()]
    .map((r) => ({ project: r.project, billable: r.billable, nonBillable: r.nonBillable, total: r.billable + r.nonBillable, members: [...r.members.entries()].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes) }))
    .sort((a, b) => b.total - a.total)
  const memberNames = [...new Set(rows.flatMap((r) => r.members.map((m) => m.name)))]
  return {
    rows,
    memberNames,
    detail: entries.map((e) => {
      const t = e.taskId ? tasks.find((x) => String(x._id) === String(e.taskId)) : undefined
      return { project: projectName(e.projectId), member: memberName(e.memberId), date: e.date, task: t ? `${t.key} ${t.title}` : '', minutes: e.minutes, billable: e.billable, status: e.status }
    }),
    truncated,
    totals: { billable: rows.reduce((s, r) => s + r.billable, 0), nonBillable: rows.reduce((s, r) => s + r.nonBillable, 0) },
  }
}
