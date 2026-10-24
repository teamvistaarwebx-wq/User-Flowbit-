import 'server-only'
import type { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { runSideEffects } from '@/lib/side-effects'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { TaskComment } from '@/models/work/TaskComment'
import { commentEffects } from '@/modules/work/tasks/comment-effects'
import type { TaskPriority, TaskStatus } from '@/modules/work/tasks/constants'
import { createTaskRecord, type TaskOrigin } from '@/modules/work/tasks/create'
import { requireTask } from '@/modules/work/tasks/load'
import { applyTaskPatch, type TaskPatch } from '@/modules/work/tasks/mutate'
import { getViewer } from '@/modules/work/tasks/viewer'
import { recordLink } from '../data/candidates'
import type { ExecResult } from './types'

/** Work changes through MCP, on the same functions the Tasks screens use (createTaskRecord, applyTaskPatch). */

export type NewTaskPayload = Readonly<{
  title: string
  description?: string
  assigneeIds?: string[]
  projectId?: string
  clientId?: string
  dueDate?: string
  dueTime?: string
  priority?: string
  status?: string
  tags?: string[]
  subtasks?: string[]
  origin?: TaskOrigin
}>

export async function createTaskMcp(ctx: Ctx, p: NewTaskPayload, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  ctx.assert('tasks.write')
  const viewer = await getViewer(ctx)
  const origin = p.origin ? { ...p.origin, via } : { kind: 'ai', label: via, via }
  const task = await createTaskRecord(ctx, viewer, {
    title: p.title,
    description: p.description,
    assigneeIds: p.assigneeIds,
    projectId: p.projectId,
    clientId: p.clientId,
    dueDate: p.dueDate,
    dueTime: p.dueTime,
    priority: (p.priority ?? 'medium') as TaskPriority,
    status: (p.status ?? 'todo') as TaskStatus,
    tags: p.tags,
    origin,
  })
  const subIds: Types.ObjectId[] = []
  for (const title of p.subtasks ?? []) subIds.push((await createTaskRecord(ctx, viewer, { title, parentId: String(task._id) }))._id)
  await audit(ctx, { action: 'mcp.task.created', entity: 'Task', entityId: task._id, summary: `Created task ${task.key} "${task.title}"${p.origin ? ` from ${p.origin.label}` : ''}`, product: 'work', meta: { via, source: p.origin?.label } })
  return { model: 'Task', id: String(task._id), label: `${task.key} ${task.title}`, link: recordLink('task', String(task._id)), action: 'created', created: [{ model: 'Task', ids: [task._id, ...subIds] }], restore: [] }
}

export type TaskUpdatePayload = Readonly<{ taskId: string; patch: TaskPatch; comment?: string }>

export async function updateTaskMcp(ctx: Ctx, p: TaskUpdatePayload, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  ctx.assert('tasks.write')
  const viewer = await getViewer(ctx)
  const task = await requireTask(ctx, viewer, p.taskId, 'edit')
  const patch = Object.fromEntries(Object.entries(p.patch).filter(([, v]) => v !== undefined)) as TaskPatch
  const changed = Object.keys(patch).length ? await applyTaskPatch(ctx, viewer, task, patch) : []
  const comment = p.comment ? await commentOn(ctx, task, p.comment) : null
  await audit(ctx, { action: 'mcp.task.updated', entity: 'Task', entityId: task._id, summary: `Updated task ${task.key} "${task.title}"${changed.length ? ` (${changed.join(', ')})` : ''}`, product: 'work', meta: { via }, changes: { before: task, after: { ...task, ...patch } } })
  return { model: 'Task', id: String(task._id), label: `${task.key} ${task.title}`, link: recordLink('task', String(task._id)), action: 'updated', created: comment ? [{ model: 'TaskComment', ids: [comment] }] : [], restore: [{ model: 'Task', docs: [task as unknown as Record<string, unknown>] }] }
}

async function commentOn(ctx: Ctx, task: Awaited<ReturnType<typeof requireTask>>, body: string): Promise<Types.ObjectId> {
  const mentions = await mentionIds(ctx, body)
  const comment = await ctx.db(TaskComment).create({ taskId: task._id, authorId: ctx.memberId, body: body.slice(0, 5000), parentId: null, mentionIds: mentions, images: [] })
  await runSideEffects('mcp comment', commentEffects(ctx, task, { _id: comment._id, body, mentionIds: mentions }))
  return comment._id
}

/** "@Vikram" in a comment → the active member whose name starts with it (first name match only). */
async function mentionIds(ctx: Ctx, body: string): Promise<Types.ObjectId[]> {
  const handles = [...body.matchAll(/@([A-Za-z][\w.-]{1,30})/g)].map((m) => m[1].toLowerCase())
  if (!handles.length) return []
  const members = await ctx.db(Member).find({ status: 'active' }, { userId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  const byUser = new Map(members.map((m) => [String(m.userId), m._id]))
  return users.filter((u) => handles.some((h) => u.name.toLowerCase().split(/\s+/)[0] === h || u.name.toLowerCase().replace(/\s+/g, '') === h)).flatMap((u) => byUser.get(String(u._id)) ?? [])
}

export async function commentTaskMcp(ctx: Ctx, p: Readonly<{ taskId: string; body: string }>, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  ctx.assertProduct('work')
  const viewer = await getViewer(ctx)
  const task = await requireTask(ctx, viewer, p.taskId)
  const id = await commentOn(ctx, task, p.body)
  await audit(ctx, { action: 'mcp.task.commented', entity: 'Task', entityId: task._id, summary: `Commented on task ${task.key} "${task.title}"`, product: 'work', meta: { via, commentId: String(id) } })
  return { model: 'TaskComment', id: String(id), label: `Comment on ${task.key}`, link: recordLink('task', String(task._id)), action: 'created', created: [{ model: 'TaskComment', ids: [id] }], restore: [] }
}
