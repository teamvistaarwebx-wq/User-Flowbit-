'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { NotFoundError } from '@/lib/errors'
import { objectId } from '@/lib/validation'
import { Task } from '@/models/work/Task'
import { logActivity } from './activity-log'
import { requireTask } from './load'
import { revalidateWork } from './revalidate'
import { getViewer } from './viewer'

const WORK = { product: 'work', perm: 'tasks.write' } as const
const itemTitle = z.string({ error: 'Type an item' }).trim().min(1, 'Type an item').max(200, 'Use at most 200 characters')

/** Checklist items live on the task (lightweight to-dos; real subtasks are child tasks). */
export const addChecklistItem = action(
  z.object({ taskId: objectId, title: itemTitle }),
  async ({ taskId, title }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, taskId, 'edit')
    await ctx.db(Task).updateOne({ _id: task._id }, { $push: { checklist: { title, done: false } } })
    await logActivity(ctx, [{ type: 'checklist_added', taskId: task._id, projectId: task.projectId, meta: { title } }])
    revalidateWork()
    return ok(`Added "${title}"`)
  },
  WORK,
)

export const toggleChecklistItem = action(
  z.object({ taskId: objectId, itemId: objectId, done: z.boolean() }),
  async ({ taskId, itemId, done }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, taskId, 'edit')
    const item = (task.checklist ?? []).find((c) => String(c._id) === itemId)
    if (!item) throw new NotFoundError('That checklist item')
    const set = done ? { 'checklist.$.done': true, 'checklist.$.doneAt': new Date(), 'checklist.$.doneById': ctx.memberId } : { 'checklist.$.done': false }
    const unset = done ? {} : { 'checklist.$.doneAt': '', 'checklist.$.doneById': '' }
    await ctx.db(Task).updateOne({ _id: task._id, 'checklist._id': item._id }, { $set: set, ...(done ? {} : { $unset: unset }) })
    await logActivity(ctx, [{ type: done ? 'checklist_item_done' : 'checklist_item_reopened', taskId: task._id, projectId: task.projectId, meta: { title: item.title } }])
    revalidateWork()
    return ok(done ? `Checked off "${item.title}"` : `Unchecked "${item.title}"`)
  },
  WORK,
)

export const renameChecklistItem = action(
  z.object({ taskId: objectId, itemId: objectId, title: itemTitle }),
  async ({ taskId, itemId, title }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, taskId, 'edit')
    const item = (task.checklist ?? []).find((c) => String(c._id) === itemId)
    if (!item) throw new NotFoundError('That checklist item')
    await ctx.db(Task).updateOne({ _id: task._id, 'checklist._id': item._id }, { $set: { 'checklist.$.title': title } })
    await logActivity(ctx, [{ type: 'checklist_renamed', taskId: task._id, projectId: task.projectId, from: item.title, to: title }])
    revalidateWork()
    return ok('Checklist item renamed')
  },
  WORK,
)

export const deleteChecklistItem = action(
  z.object({ taskId: objectId, itemId: objectId }),
  async ({ taskId, itemId }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, taskId, 'edit')
    const item = (task.checklist ?? []).find((c) => String(c._id) === itemId)
    if (!item) throw new NotFoundError('That checklist item')
    await ctx.db(Task).updateOne({ _id: task._id }, { $pull: { checklist: { _id: item._id } } })
    await logActivity(ctx, [{ type: 'checklist_removed', taskId: task._id, projectId: task.projectId, meta: { title: item.title } }])
    revalidateWork()
    return ok('Checklist item removed')
  },
  WORK,
)
