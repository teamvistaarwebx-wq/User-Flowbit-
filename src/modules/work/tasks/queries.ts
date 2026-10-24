import 'server-only'
import type { PipelineStage, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { monthRange } from '@/lib/dates'
import { oid } from '@/lib/serialize'
import { escapeRegex } from '@/lib/utils'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import type { RelationFlags, TaskRow } from '@/components/work/tasks/types'
import { canModifyTask, personalTasksMatch, visibleTasksMatch, type Viewer } from './access'
import type { TaskStatus } from './constants'
import { NO_FLAGS } from './relation-flags'
import { loadRelationFlags } from './relations'
import { boardStatuses, buildTaskMatch, sortStages, type TaskQuery } from './filters'

export const LIST_PAGE_SIZE = 25
export const BOARD_COLUMN_LIMIT = 100
const NO_DUE_LIMIT = 30

type Match = Record<string, unknown>
type Id = Types.ObjectId
const toId = (id: string): Id => oid(id)

/** Visibility (team or personal) + URL filters, ready for an aggregate. */
export async function taskMatch(ctx: Ctx, viewer: Viewer, q: TaskQuery, today: string, extra: Match[] = []): Promise<Match> {
  const projectIdsForSearch = q.q.length > 2
    ? await ctx.db(Project).distinct('_id', { $or: [{ name: { $regex: escapeRegex(q.q), $options: 'i' } }, { code: { $regex: escapeRegex(q.q), $options: 'i' } }] })
    : []
  const visibility = q.personal ? personalTasksMatch(viewer, toId) : visibleTasksMatch(viewer, toId)
  const filters = buildTaskMatch(q, { memberId: viewer.memberId, today, toId, projectIdsForSearch })
  return { $and: [visibility, filters, ...extra].filter((m) => Object.keys(m).length) }
}

type TaskLean = {
  _id: Id
  key: string
  title: string
  status: string
  priority: string
  creatorId: Id
  assigneeIds?: Id[] | null
  dueDate?: string | null
  dueTime?: string | null
  startDate?: string | null
  projectId?: Id | null
  clientId?: Id | null
  spaceId?: Id | null
  folderId?: Id | null
  isPersonal?: boolean | null
  sharedWith?: Id[] | null
  watcherIds?: Id[] | null
  tags?: string[] | null
  blockedReason?: string | null
  order?: number | null
  checklist?: { done?: boolean | null }[] | null
  blockedByIds?: Id[] | null
}

/** Done/total subtasks per parent. */
export async function subtaskCounts(ctx: Ctx, parentIds: Id[]): Promise<Map<string, { done: number; total: number }>> {
  if (!parentIds.length) return new Map()
  const rows = await ctx.db(Task).aggregate<{ _id: Id; done: number; total: number }>([
    { $match: { parentId: { $in: parentIds } } },
    { $group: { _id: '$parentId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } },
  ])
  return new Map(rows.map((r) => [String(r._id), { done: r.done, total: r.total }]))
}

export function toTaskRow(t: TaskLean, viewer: Viewer, subtasks?: { done: number; total: number }, flags: RelationFlags = NO_FLAGS): TaskRow {
  const checklist = t.checklist ?? []
  return {
    id: String(t._id),
    key: t.key,
    title: t.title,
    status: t.status as TaskRow['status'],
    priority: t.priority as TaskRow['priority'],
    assigneeIds: (t.assigneeIds ?? []).map(String),
    creatorId: String(t.creatorId),
    dueDate: t.dueDate ?? null,
    dueTime: t.dueTime ?? null,
    startDate: t.startDate ?? null,
    projectId: t.projectId ? String(t.projectId) : null,
    clientId: t.clientId ? String(t.clientId) : null,
    spaceId: t.spaceId ? String(t.spaceId) : null,
    folderId: t.folderId ? String(t.folderId) : null,
    isPersonal: Boolean(t.isPersonal),
    sharedWith: (t.sharedWith ?? []).map(String),
    tags: t.tags ?? [],
    blockedReason: t.blockedReason ?? null,
    order: t.order ?? 0,
    subtasks: subtasks ?? { done: 0, total: 0 },
    checklist: { done: checklist.filter((c) => c.done).length, total: checklist.length },
    flags,
    canEdit: canModifyTask(viewer, t),
  }
}

/** Rows with subtask counts and relation flags. */
export async function withCounts(ctx: Ctx, viewer: Viewer, docs: TaskLean[]): Promise<TaskRow[]> {
  const [counts, flags] = await Promise.all([subtaskCounts(ctx, docs.map((d) => d._id)), loadRelationFlags(ctx, docs)])
  return docs.map((d) => toTaskRow(d, viewer, counts.get(String(d._id)), flags.get(String(d._id))))
}

const ROW_FIELDS = { description: 0, attachments: 0 }

/** List view: one page plus the total. */
export async function listTasks(ctx: Ctx, viewer: Viewer, q: TaskQuery, today: string, pageSize = LIST_PAGE_SIZE) {
  const match = await taskMatch(ctx, viewer, q, today)
  const [result] = await ctx.db(Task).aggregate<{ rows: TaskLean[]; total: { n: number }[] }>([
    { $match: match },
    { $project: ROW_FIELDS },
    ...sortStages(q),
    { $facet: { rows: [{ $skip: (q.page - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: 'n' }] } },
  ])
  return { rows: await withCounts(ctx, viewer, result?.rows ?? []), total: result?.total[0]?.n ?? 0 }
}

/** Board view: up to BOARD_COLUMN_LIMIT cards per status (manual order unless a sort is chosen) and true totals. */
export async function boardTasks(ctx: Ctx, viewer: Viewer, q: TaskQuery, today: string) {
  const statuses = boardStatuses(q)
  const match = await taskMatch(ctx, viewer, q, today)
  const sort: PipelineStage.FacetPipelineStage[] = q.sort ? sortStages(q) : [{ $sort: { order: 1, createdAt: -1, _id: -1 } }]
  const facet: Record<string, PipelineStage.FacetPipelineStage[]> = Object.fromEntries(
    statuses.map((s) => [s, [{ $match: { status: s } }, ...sort, { $limit: BOARD_COLUMN_LIMIT }]]),
  )
  facet.totals = [{ $group: { _id: '$status', n: { $sum: 1 } } }]
  const [result] = await ctx.db(Task).aggregate<Record<string, unknown>>([
    { $match: match },
    { $project: ROW_FIELDS },
    { $facet: facet },
  ])
  const totalRows = (result?.totals ?? []) as { _id: string; n: number }[]
  const all = statuses.flatMap((s) => (result?.[s] ?? []) as TaskLean[])
  const rows = await withCounts(ctx, viewer, all)
  const totals = Object.fromEntries(statuses.map((s) => [s, totalRows.find((t) => t._id === s)?.n ?? 0])) as Record<TaskStatus, number>
  return { statuses, rows, totals }
}

/** Calendar view: tasks whose start..due span touches the month, plus open tasks with no due date. */
export async function calendarTasks(ctx: Ctx, viewer: Viewer, q: TaskQuery, today: string, month: string) {
  const { start, end } = monthRange(month)
  const inMonth = { dueDate: { $gte: start }, $or: [{ startDate: { $lte: end } }, { startDate: null, dueDate: { $lte: end } }] }
  const [datedMatch, undatedMatch] = await Promise.all([
    taskMatch(ctx, viewer, q, today, [inMonth]),
    taskMatch(ctx, viewer, { ...q, due: null }, today, [{ dueDate: null, status: { $ne: 'done' } }]),
  ])
  const [dated, undated] = await Promise.all([
    ctx.db(Task).aggregate<TaskLean>([{ $match: datedMatch }, { $project: ROW_FIELDS }, { $sort: { dueDate: 1, _id: 1 } }, { $limit: 500 }]),
    ctx.db(Task).aggregate<TaskLean>([{ $match: undatedMatch }, { $project: ROW_FIELDS }, { $sort: { createdAt: -1 } }, { $limit: NO_DUE_LIMIT }]),
  ])
  return { rows: await withCounts(ctx, viewer, dated), undated: await withCounts(ctx, viewer, undated) }
}
