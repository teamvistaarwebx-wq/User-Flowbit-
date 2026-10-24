import type { PipelineStage } from 'mongoose'
import { addDays } from '@/lib/dates'
import { escapeRegex } from '@/lib/utils'
import { first, type SearchParams } from '@/lib/list'
import { TASK_STATUSES, isTaskPriority, isTaskStatus, type TaskPriority, type TaskStatus } from './constants'

/**
 * Tasks page URL state (?view=&mine=1&status=todo,blocked&due=overdue&q=...)
 * and the Mongo match it maps to. Pure: ids stay strings unless `toId` is passed.
 */

export const TASK_VIEWS = ['list', 'board', 'calendar'] as const
export type TaskView = (typeof TASK_VIEWS)[number]

export const DUE_PRESETS = ['today', 'overdue', 'week', 'none'] as const
export type DuePreset = (typeof DUE_PRESETS)[number]
export const DUE_LABEL: Record<DuePreset, string> = { today: 'Due today', overdue: 'Overdue', week: 'This week', none: 'No due date' }

export const SORT_FIELDS = ['status', 'title', 'assignee', 'priority', 'dueDate', 'startDate', 'createdAt', 'updatedAt'] as const
export type SortField = (typeof SORT_FIELDS)[number]
export const SORT_LABEL: Record<SortField, string> = {
  status: 'Status', title: 'Task name', assignee: 'Assignee', priority: 'Priority',
  dueDate: 'Due date', startDate: 'Start date', createdAt: 'Date created', updatedAt: 'Date updated',
}

export type TaskQuery = {
  view: TaskView
  mine: boolean
  created: boolean
  personal: boolean
  assignee: string[]
  project: string[]
  client: string[]
  space: string | null
  folder: string | null
  priority: TaskPriority[]
  status: TaskStatus[]
  due: DuePreset | null
  tag: string | null
  q: string
  sort: SortField | null
  order: 'asc' | 'desc'
  page: number
  month: string | null
  saved: string | null
}

export const EMPTY_QUERY: TaskQuery = {
  view: 'board', mine: false, created: false, personal: false, assignee: [], project: [], client: [], space: null, folder: null,
  priority: [], status: [], due: null, tag: null, q: '', sort: null, order: 'desc', page: 1, month: null, saved: null,
}

const OBJECT_ID = /^[a-f0-9]{24}$/i
const csv = (v: string | string[] | undefined) => (first(v) ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const ids = (v: string | string[] | undefined) => csv(v).filter((s) => OBJECT_ID.test(s))
const oneId = (v: string | string[] | undefined) => ids(v)[0] ?? null
const flag = (v: string | string[] | undefined) => first(v) === '1'

export function parseTaskQuery(sp: SearchParams, defaults: Partial<TaskQuery> = {}): TaskQuery {
  const base = { ...EMPTY_QUERY, ...defaults }
  const view = first(sp.view)
  const due = first(sp.due)
  const sort = first(sp.sort)
  const month = first(sp.month)
  const has = (key: string) => first(sp[key]) !== undefined
  return {
    view: (TASK_VIEWS as readonly string[]).includes(view ?? '') ? (view as TaskView) : base.view,
    mine: has('mine') ? flag(sp.mine) : base.mine,
    created: has('created') ? flag(sp.created) : base.created,
    personal: has('personal') ? flag(sp.personal) : base.personal,
    assignee: ids(sp.assignee),
    project: ids(sp.project),
    client: ids(sp.client),
    space: oneId(sp.space),
    folder: oneId(sp.folder),
    priority: csv(sp.priority).filter(isTaskPriority),
    status: csv(sp.status).filter(isTaskStatus),
    due: (DUE_PRESETS as readonly string[]).includes(due ?? '') ? (due as DuePreset) : null,
    tag: first(sp.tag)?.trim().slice(0, 50) || null,
    q: (first(sp.q) ?? '').trim().slice(0, 100),
    sort: (SORT_FIELDS as readonly string[]).includes(sort ?? '') ? (sort as SortField) : null,
    order: first(sp.order) === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1),
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
    saved: oneId(sp.saved),
  }
}

/** Query string (no '?') for a query with a patch applied; empty values are dropped. */
export function taskQueryString(q: TaskQuery, patch: Partial<TaskQuery> = {}): string {
  const next = { ...q, ...patch }
  const params = new URLSearchParams()
  params.set('view', next.view)
  if (next.mine) params.set('mine', '1')
  if (next.created) params.set('created', '1')
  if (next.personal) params.set('personal', '1')
  const lists: [string, string[]][] = [['assignee', next.assignee], ['project', next.project], ['client', next.client], ['priority', next.priority], ['status', next.status]]
  for (const [key, list] of lists) if (list.length) params.set(key, list.join(','))
  if (next.space) params.set('space', next.space)
  if (next.folder) params.set('folder', next.folder)
  if (next.due) params.set('due', next.due)
  if (next.tag) params.set('tag', next.tag)
  if (next.q) params.set('q', next.q)
  if (next.sort) params.set('sort', next.sort)
  if (next.sort && next.order === 'asc') params.set('order', 'asc')
  if (next.page > 1) params.set('page', String(next.page))
  if (next.month && next.view === 'calendar') params.set('month', next.month)
  if (next.saved) params.set('saved', next.saved)
  return params.toString()
}

/**
 * Filters shown as chips (view, sort, page and saved view don't count). Filters
 * the page itself fixes (`locked`, e.g. a project's Tasks tab) have no chip and don't count.
 */
export function activeFilterCount(q: TaskQuery, locked: readonly string[] = []): number {
  const project = locked.includes('project') ? 0 : q.project.length
  const space = locked.includes('space') ? null : q.space
  const folder = locked.includes('folder') ? null : q.folder
  const client = locked.includes('client') ? 0 : q.client.length
  return [q.mine, q.created, q.assignee.length, project, client, space, folder, q.priority.length, q.status.length, q.due, q.tag, q.q].filter(Boolean).length
}

type Id = unknown
type Match = Record<string, unknown>

/** Due preset -> clause (all presets exclude done tasks). */
export function dueClause(due: DuePreset, today: string): Match {
  const open = { status: { $ne: 'done' } }
  if (due === 'today') return { ...open, dueDate: today }
  if (due === 'overdue') return { ...open, dueDate: { $lt: today } }
  if (due === 'week') return { ...open, dueDate: { $gte: today, $lte: addDays(today, 6) } }
  return { ...open, dueDate: null }
}

/** Regex sources for a search: the whole term, plus each word longer than 2 characters. */
export function searchPatterns(term: string): string[] {
  const clean = term.trim()
  if (!clean) return []
  const words = clean.split(/\s+/).filter((w) => w.length > 2)
  return [...new Set([clean, ...(words.length > 1 ? words : [])])].map(escapeRegex)
}

/** Search clause: short terms match the title only; longer ones also key, description, tags and matching projects. */
export function searchClause(term: string, projectIds: Id[] = []): Match | null {
  const patterns = searchPatterns(term)
  if (!patterns.length) return null
  if (term.trim().length <= 2) return { title: { $regex: patterns[0], $options: 'i' } }
  const fields = ['title', 'key', 'description', 'tags']
  const or: Match[] = patterns.flatMap((p) => fields.map((f) => ({ [f]: { $regex: p, $options: 'i' } })))
  if (projectIds.length) or.push({ projectId: { $in: projectIds } })
  return { $or: or }
}

export type MatchOptions = { memberId: string; today: string; toId?: (id: string) => Id; projectIdsForSearch?: Id[]; topLevelOnly?: boolean }

/** URL filters -> Mongo match clauses (visibility is added by the caller). */
export function buildTaskMatch(q: TaskQuery, opts: MatchOptions): Match {
  const toId = opts.toId ?? ((id: string) => id)
  const me = toId(opts.memberId)
  const and: Match[] = []
  if (opts.topLevelOnly !== false) and.push({ parentId: null })
  if (q.mine) and.push({ assigneeIds: me })
  if (q.created) and.push({ creatorId: me })
  if (q.assignee.length) and.push({ assigneeIds: { $in: q.assignee.map(toId) } })
  if (q.project.length) and.push({ projectId: { $in: q.project.map(toId) } })
  if (q.client.length) and.push({ clientId: { $in: q.client.map(toId) } })
  if (q.space) and.push({ spaceId: toId(q.space) })
  if (q.folder) and.push({ folderId: toId(q.folder) })
  if (q.priority.length) and.push({ priority: { $in: q.priority } })
  if (q.status.length) and.push({ status: { $in: q.status } })
  if (q.due) and.push(dueClause(q.due, opts.today))
  if (q.tag) and.push({ tags: q.tag })
  const search = searchClause(q.q, opts.projectIdsForSearch)
  if (search) and.push(search)
  return and.length ? { $and: and } : {}
}

/** Board columns for a query: the chosen statuses, and no Done column when filtering by Blocked. */
export function boardStatuses(q: TaskQuery): TaskStatus[] {
  if (q.status.length) return TASK_STATUSES.filter((s) => q.status.includes(s))
  return [...TASK_STATUSES]
}

/** Aggregate stages for a sort: computed ranks for status/priority, then $sort with a stable tie-break. */
export function sortStages(q: TaskQuery, fallback: SortField = 'createdAt'): PipelineStage.FacetPipelineStage[] {
  const field = q.sort ?? fallback
  const dir = q.sort ? (q.order === 'asc' ? 1 : -1) : field === 'createdAt' ? -1 : 1
  if (field === 'status') return [{ $addFields: { _rank: { $indexOfArray: [TASK_STATUSES, '$status'] } } }, { $sort: { _rank: dir, createdAt: -1, _id: -1 } }]
  if (field === 'priority') return [{ $addFields: { _rank: { $indexOfArray: [['urgent', 'high', 'medium', 'low'], '$priority'] } } }, { $sort: { _rank: dir, createdAt: -1, _id: -1 } }]
  if (field === 'title') return [{ $addFields: { _rank: { $toLower: '$title' } } }, { $sort: { _rank: dir, _id: -1 } }]
  if (field === 'assignee') {
    // First assignee's name: members and users are looked up by _id (ids already belong to this org).
    return [
      { $addFields: { _first: { $arrayElemAt: ['$assigneeIds', 0] } } },
      { $lookup: { from: 'members', localField: '_first', foreignField: '_id', as: '_m' } },
      { $lookup: { from: 'users', localField: '_m.userId', foreignField: '_id', as: '_u' } },
      { $addFields: { _rank: { $toLower: { $ifNull: [{ $arrayElemAt: ['$_u.name', 0] }, ''] } } } },
      { $project: { _m: 0, _u: 0, _first: 0 } },
      { $sort: { _rank: dir, _id: -1 } },
    ]
  }
  if (field === 'dueDate' || field === 'startDate') {
    // Tasks without the date go last whichever way.
    return [{ $addFields: { _missing: { $cond: [{ $ifNull: [`$${field}`, false] }, 0, 1] } } }, { $sort: { _missing: 1, [field]: dir, _id: -1 } }]
  }
  return [{ $sort: { [field]: dir, _id: -1 } }]
}
