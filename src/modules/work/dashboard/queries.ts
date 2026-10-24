import 'server-only'
import type { PipelineStage } from 'mongoose'
import { officeHoursOf, type PunchType } from '@/lib/attendance'
import type { Ctx } from '@/lib/ctx'
import { DEFAULT_WORK_WEEK, isoDateIST, monthRange } from '@/lib/dates'
import { oid } from '@/lib/serialize'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Task } from '@/models/work/Task'
import { visibleTasksMatch, type Viewer } from '@/modules/work/tasks/access'
import { toTaskRow } from '@/modules/work/tasks/queries'
import { sendTaskReminders } from '@/modules/work/reminders'
import { getMonthRegister } from '@/modules/muster/attendance/queries'
import { cellsAttendance, monthAttendance } from './attendance'
import { currentCounts, dailySeries, fromStatGroups, rollingDelta, snapshotDelta, SPARK_DAYS, statGroupStage, statWindow, type StatGroupRow } from './stats'

export type HomeTab = 'all' | 'done' | 'due'
export const ASSIGNED_LIMIT = 8
const DONE_WINDOW_DAYS = 30

/** In progress / Overdue / Completed for me (personal included) or, with tasks.manage, everyone. */
export async function homeStats(ctx: Ctx, viewer: Viewer, scope: 'me' | 'all', today: string) {
  const since = new Date(Date.now() - (SPARK_DAYS + 7) * 86_400_000)
  const who = scope === 'all' ? visibleTasksMatch(viewer, oid) : { assigneeIds: ctx.memberId }
  // Grouped in MongoDB (a few hundred rows at most), so the cost does not grow with the number of tasks.
  const span = statWindow(today)
  const groups = await ctx.db(Task).aggregate<StatGroupRow>([
    { $match: { $and: [who, { $or: [{ status: { $ne: 'done' } }, { completedAt: { $gte: since } }] }] } },
    statGroupStage(span),
  ])
  const rows = fromStatGroups(groups, span)
  const series = dailySeries(rows, today)
  const now = currentCounts(rows, today)
  return {
    inProgress: { value: now.inProgress, delta: snapshotDelta(series.inProgress), trend: series.inProgress },
    overdue: { value: now.overdue, delta: snapshotDelta(series.overdue), trend: series.overdue },
    completed: { value: now.completed, delta: rollingDelta(series.completed), trend: series.completed },
  }
}

const PRIORITY_RANK = { $indexOfArray: [['urgent', 'high', 'medium', 'low'], '$priority'] }

function assignedPipeline(tab: HomeTab, today: string): PipelineStage[] {
  if (tab === 'done') {
    return [{ $match: { status: 'done', completedAt: { $gte: new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000) } } }, { $sort: { completedAt: -1 } }]
  }
  const due = tab === 'due' ? [{ $match: { dueDate: { $lte: today } } }] : []
  return [
    { $match: { status: { $ne: 'done' } } },
    ...due,
    {
      $addFields: {
        _overdue: { $cond: [{ $and: [{ $eq: [{ $type: '$dueDate' }, 'string'] }, { $lt: ['$dueDate', today] }] }, 1, 0] },
        _noDue: { $cond: [{ $eq: [{ $type: '$dueDate' }, 'string'] }, 0, 1] },
        _rank: PRIORITY_RANK,
      },
    },
    { $sort: { _overdue: -1, _noDue: 1, dueDate: 1, _rank: 1, _id: 1 } },
  ]
}

/** "Assign to me" table: one tab's first rows plus each tab's count. */
export async function assignedToMe(ctx: Ctx, viewer: Viewer, tab: HomeTab, today: string) {
  const mine = { $match: { assigneeIds: ctx.memberId } }
  const [result] = await ctx.db(Task).aggregate<{ rows: Parameters<typeof toTaskRow>[0][]; all: { n: number }[]; done: { n: number }[]; due: { n: number }[] }>([
    mine,
    { $project: { description: 0, attachments: 0 } },
    {
      $facet: {
        rows: [...(assignedPipeline(tab, today) as PipelineStage.FacetPipelineStage[]), { $limit: ASSIGNED_LIMIT }],
        all: [...(assignedPipeline('all', today).slice(0, 1) as PipelineStage.FacetPipelineStage[]), { $count: 'n' }],
        done: [...(assignedPipeline('done', today).slice(0, 1) as PipelineStage.FacetPipelineStage[]), { $count: 'n' }],
        due: [...(assignedPipeline('due', today).slice(0, 2) as PipelineStage.FacetPipelineStage[]), { $count: 'n' }],
      },
    },
  ])
  return {
    rows: (result?.rows ?? []).map((t) => toTaskRow(t, viewer)),
    counts: { all: result?.all[0]?.n ?? 0, done: result?.done[0]?.n ?? 0, due: result?.due[0]?.n ?? 0 },
  }
}

/** Status counts of my own tasks, for workspaces without projects (personal mode). */
export async function myTaskCounts(ctx: Ctx) {
  const rows = await ctx.db(Task).aggregate<{ _id: string; n: number }>([{ $match: { assigneeIds: ctx.memberId, parentId: null } }, { $group: { _id: '$status', n: { $sum: 1 } } }])
  const n = (s: string) => rows.find((r) => r._id === s)?.n ?? 0
  return { total: rows.reduce((s, r) => s + r.n, 0), completed: n('done'), inProgress: n('in_progress') + n('in_review'), blocked: n('blocked'), overdue: 0 }
}

/** Today's punches and office hours for the workday timeline. */
export async function workdayData(ctx: Ctx, today: string) {
  const day = await ctx.db(AttendanceDay).findOne({ memberId: ctx.memberId, date: today }, { punches: 1, status: 1 }).lean()
  const workWeek = ctx.org.workWeek?.length ? ctx.org.workWeek : DEFAULT_WORK_WEEK
  return {
    hours: officeHoursOf(ctx),
    punches: (day?.punches ?? []).map((p) => ({ type: p.type as PunchType, at: new Date(p.at).toISOString() })),
    status: day?.status ?? null,
    workWeek: [...workWeek],
  }
}

/** My attendance for a month: summary, calendar marks and the rows (for day details). */
export async function attendanceMonth(ctx: Ctx, month: string, today: string) {
  const { start, end } = monthRange(month)
  const rows = await ctx.db(AttendanceDay).find({ memberId: ctx.memberId, date: { $gte: start, $lte: end } }).sort({ date: 1 }).lean()
  // Linked to a Muster employee: the register (leave, holidays, join date, unmarked-day policy), as My attendance shows it.
  if (ctx.has('muster') && ctx.member.employeeId) {
    const register = await getMonthRegister(ctx, month, { employeeIds: [String(ctx.member.employeeId)] })
    const cells = register.rows[0]?.cells
    if (cells) return { summary: cellsAttendance(cells, month, today), rows }
  }
  const workWeek = ctx.org.workWeek?.length ? ctx.org.workWeek : DEFAULT_WORK_WEEK
  // Nothing can be recorded before the member (or the workspace) existed.
  const joined = ctx.member.joinedAt ?? ctx.member.createdAt ?? ctx.org.createdAt
  const since = joined ? isoDateIST(new Date(joined)) : ''
  return { summary: monthAttendance(rows, month, today, workWeek, since), rows }
}

/** Due-today and overdue reminders for my open tasks, on the first Home visit of the day (see modules/work/reminders). */
export async function sendDueReminders(ctx: Ctx, today: string): Promise<void> {
  await sendTaskReminders(ctx, today, { memberId: ctx.memberId, userId: ctx.userId })
}
