'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { formatDate } from '@/lib/dates'
import { isoDate, objectId, requiredText } from '@/lib/validation'
import { Meeting } from '@/models/work/Meeting'
import { afterTasksCreated, createTasks } from '../arc/task-writer'
import { assertActiveMembers } from '../teams/people'
import { assertParticipant, loadMeeting } from './access'

const W = { product: 'work' } as const
const refresh = (id: string) => revalidatePath(`/app/work/meetings/${id}`)

export const addActionItem = action(
  z.object({ id: objectId, title: requiredText('Action item', 200), assigneeId: objectId.optional(), dueDate: isoDate.optional() }),
  async ({ id, title, assigneeId, dueDate }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    if (assigneeId) await assertActiveMembers(ctx, [assigneeId])
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $push: { actionItems: { title, assigneeId, dueDate, done: false } } })
    refresh(id)
    return ok('Action item added')
  },
  W,
)

export const toggleActionItem = action(
  z.object({ id: objectId, itemId: objectId, done: z.boolean() }),
  async ({ id, itemId, done }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    await ctx.db(Meeting).updateOne({ _id: meeting._id, 'actionItems._id': itemId }, { $set: { 'actionItems.$.done': done } })
    refresh(id)
    return ok()
  },
  W,
)

export const removeActionItem = action(
  z.object({ id: objectId, itemId: objectId }),
  async ({ id, itemId }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $pull: { actionItems: { _id: itemId } } })
    refresh(id)
    return ok('Action item removed')
  },
  W,
)

/** Turns action items without a task into real tasks ("From meeting 'X' on 3 Oct"). */
export const createTasksFromItems = action(
  z.object({ id: objectId, itemId: objectId.optional() }),
  async ({ id, itemId }, ctx) => {
    ctx.assert('tasks.write')
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    const items = meeting.actionItems.filter((i) => !i.taskId && (!itemId || String(i._id) === itemId))
    if (!items.length) return fail(itemId ? 'That item already has a task.' : 'Every action item already has a task.')
    const description = `From meeting '${meeting.title}' on ${formatDate(meeting.startAt, { short: true })}`
    const drafts = items.map((i) => ({ title: i.title, description, assigneeIds: i.assigneeId ? [String(i.assigneeId)] : undefined, dueDate: i.dueDate ?? undefined, projectId: meeting.projectId ?? undefined }))
    const created = await createTasks(ctx, drafts)
    for (const [n, item] of items.entries()) {
      await ctx.db(Meeting).updateOne({ _id: meeting._id, 'actionItems._id': item._id }, { $set: { 'actionItems.$.taskId': created[n].id } })
    }
    await afterTasksCreated(ctx, created)
    refresh(id)
    revalidatePath('/app/work/tasks')
    return ok(items.length === 1 ? `Task '${items[0].title}' created` : `${items.length} tasks created`)
  },
  W,
)
