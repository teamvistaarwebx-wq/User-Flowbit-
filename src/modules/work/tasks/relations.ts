import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { oid } from '@/lib/serialize'
import { Task } from '@/models/work/Task'
import type { RelationFlags } from '@/components/work/tasks/types'
import { escapeRegex } from '@/lib/utils'
import { canAccessTask, personalTasksMatch, visibleTasksMatch, type Viewer } from './access'
import { logActivity } from './activity-log'
import { requireTask, type TaskDoc } from './load'
import { closesLoop, NO_FLAGS, openBlockersNote, otherEndAccess, relationFlags, type RelationKind } from './relation-flags'

type Id = Types.ObjectId
type FlagSource = { _id: Id; status: string; blockedByIds?: Id[] | null }

/** Loop checks walk at most this many tasks. */
const LOOP_SCAN_LIMIT = 500
const RELATED_FIELDS = { key: 1, title: 1, status: 1, isPersonal: 1, creatorId: 1, assigneeIds: 1, sharedWith: 1, watcherIds: 1, projectId: 1, spaceId: 1 }

/** Blocked / blocking flags for a page of rows: two queries, whatever the page size. */
export async function loadRelationFlags(ctx: Ctx, docs: FlagSource[]): Promise<Map<string, RelationFlags>> {
  const ids = docs.map((d) => d._id)
  const blockerIds = [...new Set(docs.flatMap((d) => (d.blockedByIds ?? []).map(String)))]
  if (!ids.length) return new Map()
  const [blockers, dependents] = await Promise.all([
    blockerIds.length ? ctx.db(Task).find({ _id: { $in: blockerIds.map(oid) } }, { status: 1 }).lean() : [],
    ctx.db(Task).find({ blockedByIds: { $in: ids } }, { status: 1, blockedByIds: 1 }).lean(),
  ])
  const statusOf = new Map(blockers.map((b) => [String(b._id), b.status as string]))
  return new Map(
    docs.map((d) => {
      const id = String(d._id)
      const mine = (d.blockedByIds ?? []).map((b) => statusOf.get(String(b))).filter((s): s is string => Boolean(s))
      const held = dependents.filter((t) => (t.blockedByIds ?? []).some((b) => String(b) === id)).map((t) => t.status as string)
      const flags = mine.length || held.length ? relationFlags(d.status, mine, held) : NO_FLAGS
      return [id, flags]
    }),
  )
}

export type RelatedTask = { id: string; key: string; title: string; status: string }
export type TaskRelations = { blockedBy: RelatedTask[]; blocks: RelatedTask[]; related: RelatedTask[] }

/** The task's relations, limited to tasks this viewer may see. */
export async function taskRelations(ctx: Ctx, viewer: Viewer, task: TaskDoc): Promise<TaskRelations> {
  const [blockedBy, blocks, related] = await Promise.all([
    (task.blockedByIds ?? []).length ? ctx.db(Task).find({ _id: { $in: task.blockedByIds } }, RELATED_FIELDS).lean() : [],
    ctx.db(Task).find({ blockedByIds: task._id }, RELATED_FIELDS).limit(50).lean(),
    (task.relatedIds ?? []).length ? ctx.db(Task).find({ _id: { $in: task.relatedIds } }, RELATED_FIELDS).lean() : [],
  ])
  const view = (rows: typeof blocks): RelatedTask[] =>
    rows.filter((t) => canAccessTask(viewer, t)).map((t) => ({ id: String(t._id), key: t.key, title: t.title, status: t.status }))
  return { blockedBy: view(blockedBy), blocks: view(blocks), related: view(related) }
}

/** Would `blockerId` blocking `taskId` close a loop? Walks the blockers' own blockers. */
async function wouldLoop(ctx: Ctx, taskId: string, blockerId: string): Promise<boolean> {
  const blockersOf = new Map<string, string[]>()
  let frontier = [blockerId]
  while (frontier.length && blockersOf.size < LOOP_SCAN_LIMIT) {
    const rows = await ctx.db(Task).find({ _id: { $in: frontier.map(oid) } }, { blockedByIds: 1 }).lean()
    rows.forEach((r) => blockersOf.set(String(r._id), (r.blockedByIds ?? []).map(String)))
    frontier = [...new Set(rows.flatMap((r) => (r.blockedByIds ?? []).map(String)))].filter((id) => !blockersOf.has(id))
  }
  return closesLoop(taskId, blockerId, blockersOf)
}

/**
 * The two ends of a relation: this task (edited) and the other one. "Blocks" writes onto
 * the other task, so it needs edit access there; otherwise it only needs to be visible.
 */
async function relationEnds(ctx: Ctx, viewer: Viewer, id: string, otherId: string, kind: RelationKind) {
  if (id === otherId) throw new UserError("A task can't be linked to itself.")
  const task = await requireTask(ctx, viewer, id, 'edit')
  const other = await requireTask(ctx, viewer, otherId, otherEndAccess(kind))
  if (Boolean(task.isPersonal) !== Boolean(other.isPersonal)) throw new UserError('Personal to-dos link only to other personal to-dos.')
  return { task, other }
}

const meta = (kind: RelationKind, t: { key: string; title: string }) => ({ kind, key: t.key, title: t.title })

export async function addRelation(ctx: Ctx, viewer: Viewer, id: string, otherId: string, kind: RelationKind): Promise<TaskDoc> {
  const { task, other } = await relationEnds(ctx, viewer, id, otherId, kind)
  if (kind === 'related') {
    await ctx.db(Task).updateOne({ _id: task._id }, { $addToSet: { relatedIds: other._id } })
    await ctx.db(Task).updateOne({ _id: other._id }, { $addToSet: { relatedIds: task._id } })
  } else {
    const [blocked, blocker] = kind === 'blocked_by' ? [task, other] : [other, task]
    if (await wouldLoop(ctx, String(blocked._id), String(blocker._id))) throw new UserError(`${blocker.key} already waits on ${blocked.key}, so it can't block it.`)
    await ctx.db(Task).updateOne({ _id: blocked._id }, { $addToSet: { blockedByIds: blocker._id } })
  }
  await logActivity(ctx, [{ type: 'relation_added', taskId: task._id, projectId: task.projectId, meta: meta(kind, other) }])
  return other
}

export async function removeRelation(ctx: Ctx, viewer: Viewer, id: string, otherId: string, kind: RelationKind): Promise<void> {
  const task = await requireTask(ctx, viewer, id, 'edit')
  if (otherEndAccess(kind) === 'edit') await requireTask(ctx, viewer, otherId, 'edit')
  const other = await ctx.db(Task).findById(otherId, { key: 1, title: 1 }).lean()
  const otherOid = oid(otherId)
  if (kind === 'related') {
    await ctx.db(Task).updateOne({ _id: task._id }, { $pull: { relatedIds: otherOid } })
    await ctx.db(Task).updateOne({ _id: otherOid }, { $pull: { relatedIds: task._id } })
  } else if (kind === 'blocked_by') {
    await ctx.db(Task).updateOne({ _id: task._id }, { $pull: { blockedByIds: otherOid } })
  } else {
    await ctx.db(Task).updateOne({ _id: otherOid }, { $pull: { blockedByIds: task._id } })
  }
  if (other) await logActivity(ctx, [{ type: 'relation_removed', taskId: task._id, projectId: task.projectId, meta: meta(kind, other) }])
}

/** A finished task tells the open tasks it was blocking (their timeline shows it; Blocked ones can be unblocked). */
export async function logBlockerDone(ctx: Ctx, task: { _id: Id; key: string; title: string }): Promise<void> {
  const waiting = await ctx.db(Task).find({ blockedByIds: task._id, status: { $ne: 'done' } }, { projectId: 1 }).lean()
  await logActivity(ctx, waiting.map((t) => ({ type: 'blocker_done' as const, taskId: t._id, projectId: t.projectId, meta: { key: task.key, title: task.title } })))
}

/** "VW-12 is still open" when the task's blockers are not done yet, for the "moved to Done" toast. */
export async function openBlockersWarning(ctx: Ctx, task: { blockedByIds?: Id[] | null }): Promise<string | undefined> {
  const ids = task.blockedByIds ?? []
  if (!ids.length) return undefined
  const open = await ctx.db(Task).find({ _id: { $in: ids }, status: { $ne: 'done' } }, { key: 1 }).lean()
  return openBlockersNote(open.map((t) => t.key))
}

/** Tasks the viewer can link to, by key or title. */
export async function searchLinkable(ctx: Ctx, viewer: Viewer, task: TaskDoc, q: string, limit = 8): Promise<RelatedTask[]> {
  const scope = task.isPersonal ? personalTasksMatch(viewer, oid) : visibleTasksMatch(viewer, oid)
  const text = q.trim() ? { $or: [{ key: { $regex: `^${escapeRegex(q.trim())}`, $options: 'i' } }, { title: { $regex: escapeRegex(q.trim()), $options: 'i' } }] } : {}
  const rows = await ctx.db(Task).find({ $and: [scope, text, { _id: { $ne: task._id } }] }, RELATED_FIELDS).sort({ updatedAt: -1 }).limit(limit).lean()
  return rows.map((t) => ({ id: String(t._id), key: t.key, title: t.title, status: t.status }))
}
