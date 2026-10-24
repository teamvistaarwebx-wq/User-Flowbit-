'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { ForbiddenError } from '@/lib/errors'
import { isoDate, objectId } from '@/lib/validation'
import { Member } from '@/models/Member'
import { Task } from '@/models/work/Task'
import { canShareTask } from './access'
import { logActivity } from './activity-log'
import { STATUS_LABEL, TITLE_MAX, type TaskStatus } from './constants'
import { createTaskRecord } from './create'
import { requireTask, type TaskDoc } from './load'
import { applyTaskPatch } from './mutate'
import { openBlockersWarning } from './relations'
import { removeTask } from './remove'
import { revalidateWork } from './revalidate'
import { createTaskSchema, dueTimeField, patchTaskSchema, priorityField, statusField } from './schemas'
import { getViewer } from './viewer'

const WORK = { product: 'work', perm: 'tasks.write' } as const

/** Marking a task done is allowed with open blockers, but the toast says which are still open. */
async function doneWarning(ctx: Ctx, task: TaskDoc, to: TaskStatus): Promise<string | undefined> {
  return to === 'done' && task.status !== 'done' ? openBlockersWarning(ctx, task) : undefined
}

const withBlockerNote = (message: string, note: string | undefined) => (note ? `${message}. Heads up: ${note}.` : message)

/** Create task dialog (full form). Stays on the page; the new row is highlighted by id. */
export const createTask = action(
  createTaskSchema,
  async (input, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await createTaskRecord(ctx, viewer, { ...input, estimateMinutes: input.estimate })
    revalidateWork()
    return ok(`Task '${task.title}' created`, { id: String(task._id), key: task.key })
  },
  WORK,
)

/** Inline quick add (list row, board column, calendar day, subtasks). */
export const quickAddTask = action(
  z.object({
    title: z.string().trim().min(1, 'Type a title').max(TITLE_MAX),
    status: statusField.optional(),
    dueDate: isoDate.optional(),
    dueTime: dueTimeField.optional(),
    projectId: objectId.optional(),
    spaceId: objectId.optional(),
    folderId: objectId.optional(),
    clientId: objectId.optional(),
    assigneeIds: z.array(objectId).max(20).optional(),
    priority: priorityField.optional(),
    personal: z.boolean().optional(),
    parentId: objectId.optional(),
    blockedReason: z.string().max(1000).optional(),
  }),
  async (input, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await createTaskRecord(ctx, viewer, input)
    revalidateWork()
    return ok(input.parentId ? `Subtask '${task.title}' added` : `Task '${task.title}' created`, { id: String(task._id) })
  },
  WORK,
)

/** One edit from the task detail page, a board drag or a quick complete. */
export const updateTask = action(
  patchTaskSchema,
  async ({ id, ...patch }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, id, 'edit')
    const changed = await applyTaskPatch(ctx, viewer, task, patch)
    revalidateWork()
    const data = { previous: task.status as string }
    if (!changed.length) return ok<typeof data>(undefined, data)
    const title = patch.title?.trim() || task.title
    if (patch.status && patch.status !== task.status) return ok(withBlockerNote(`Task '${title}' moved to ${STATUS_LABEL[patch.status]}`, await doneWarning(ctx, task, patch.status)), data)
    return ok('Saved', data)
  },
  WORK,
)

/** Board drag: status change (with a reason for Blocked) and a place between two neighbours. */
export const moveTaskOnBoard = action(
  z.object({ id: objectId, status: statusField, beforeId: objectId.optional(), afterId: objectId.optional(), blockedReason: z.string().max(1000).optional() }),
  async ({ id, status, beforeId, afterId, blockedReason }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, id, 'edit')
    if (status !== task.status) await applyTaskPatch(ctx, viewer, task, { status, blockedReason })
    const [before, after] = await Promise.all([
      beforeId ? ctx.db(Task).findById(beforeId, { order: 1 }).lean() : null,
      afterId ? ctx.db(Task).findById(afterId, { order: 1 }).lean() : null,
    ])
    const order = before && after ? (before.order + after.order) / 2 : before ? before.order + 1 : after ? after.order - 1 : task.order
    if (order !== task.order) await ctx.db(Task).updateOne({ _id: task._id }, { $set: { order } })
    revalidateWork()
    return status !== task.status ? ok(withBlockerNote(`Task '${task.title}' moved to ${STATUS_LABEL[status]}`, await doneWarning(ctx, task, status))) : ok()
  },
  WORK,
)

export const deleteTask = action(
  z.object({ id: objectId, from: z.enum(['detail', 'list']).optional() }),
  async ({ id, from }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, id, 'edit')
    await removeTask(ctx, task)
    // From the detail page the client navigates away; refreshing the deleted task's page would flash a 404.
    if (from !== 'detail') revalidateWork()
    const back = task.parentId ? `/app/work/tasks/${task.parentId}` : '/app/work/tasks'
    return ok(`Task '${task.title}' deleted`, undefined, from === 'detail' ? back : undefined)
  },
  WORK,
)

/** Watch / unwatch: watchers get status and comment notifications. */
export const toggleWatch = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, id)
    const watching = (task.watcherIds ?? []).some((w) => String(w) === viewer.memberId)
    await ctx.db(Task).updateOne({ _id: task._id }, watching ? { $pull: { watcherIds: ctx.memberId } } : { $addToSet: { watcherIds: ctx.memberId } })
    if (!watching) await logActivity(ctx, [{ type: 'watcher_added', taskId: task._id, projectId: task.projectId }])
    revalidateWork()
    return ok(watching ? `You stopped watching '${task.title}'` : `You're watching '${task.title}'`)
  },
  { product: 'work', perm: 'tasks.read' },
)

/** Share a personal task with other members (creator or assignee only). */
export const shareTask = action(
  z.object({ id: objectId, memberIds: z.array(objectId) }),
  async ({ id, memberIds }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, id)
    if (!canShareTask(viewer, task)) throw new ForbiddenError('Only the people on a personal task can change who it is shared with.')
    const active = await ctx.db(Member).find({ _id: { $in: memberIds }, status: 'active' }, { _id: 1 }).lean()
    await ctx.db(Task).updateOne({ _id: task._id }, { $set: { sharedWith: active.map((m) => m._id) } })
    await logActivity(ctx, [{ type: 'shared', taskId: task._id, to: active.map((m) => String(m._id)) }])
    revalidateWork()
    return ok(active.length ? `Shared with ${active.length} ${active.length === 1 ? 'person' : 'people'}` : 'No longer shared')
  },
  WORK,
)
