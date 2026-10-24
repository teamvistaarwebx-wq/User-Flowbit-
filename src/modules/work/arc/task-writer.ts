import 'server-only'
import type { ClientSession, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { notifyMembers } from '@/lib/notify'
import { Task } from '@/models/work/Task'
import { recomputeProjectHealth } from '../projects/stats'
import { logActivity } from '../tasks/activity-log'
import { nextTaskKey } from '../tasks/create'

export type TaskDraft = {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  assigneeIds?: string[]
  projectId?: string | Types.ObjectId
  parentId?: string | Types.ObjectId
  milestoneId?: string | Types.ObjectId
  clientId?: string | Types.ObjectId
  spaceId?: string | Types.ObjectId
  dueDate?: string
  startDate?: string
  estimateMinutes?: number
}

export type CreatedTask = { id: Types.ObjectId; title: string; projectId?: string; parentId?: string; assigneeIds: string[] }

/**
 * Creates real Work tasks (Arc drafts, meeting action items) with the same key
 * series as the Tasks page. Assignees default to the person creating them.
 * Call `afterTasksCreated` once the write (or transaction) has committed.
 */
export async function createTasks(ctx: Ctx, drafts: TaskDraft[], session?: ClientSession): Promise<CreatedTask[]> {
  const out: CreatedTask[] = []
  for (const [i, d] of drafts.entries()) {
    const assigneeIds = d.assigneeIds?.length ? d.assigneeIds : [String(ctx.memberId)]
    const task = await ctx.db(Task).create(
      {
        key: await nextTaskKey(ctx),
        title: d.title,
        description: d.description,
        status: 'todo',
        priority: d.priority ?? 'medium',
        assigneeIds,
        creatorId: ctx.memberId,
        projectId: d.projectId,
        parentId: d.parentId ?? null,
        milestoneId: d.milestoneId,
        clientId: d.clientId,
        spaceId: d.spaceId,
        dueDate: d.dueDate,
        startDate: d.startDate,
        estimateMinutes: d.estimateMinutes,
        isPersonal: false,
        tags: [],
        order: -Date.now() - i,
      },
      { session },
    )
    out.push({ id: task._id as Types.ObjectId, title: d.title, projectId: d.projectId ? String(d.projectId) : undefined, parentId: d.parentId ? String(d.parentId) : undefined, assigneeIds })
  }
  return out
}

/** Activity rows, project health and assignment notifications for new tasks. */
export async function afterTasksCreated(ctx: Ctx, tasks: CreatedTask[]): Promise<void> {
  if (!tasks.length) return
  await logActivity(ctx, [
    ...tasks.map((t) => ({ type: 'created' as const, taskId: t.id, projectId: t.projectId })),
    ...tasks.filter((t) => t.parentId).map((t) => ({ type: 'subtask_added' as const, taskId: t.parentId, projectId: t.projectId, meta: { title: t.title } })),
  ])
  for (const projectId of new Set(tasks.flatMap((t) => (t.projectId ? [t.projectId] : [])))) await recomputeProjectHealth(ctx, projectId)
  for (const t of tasks) {
    await notifyMembers(ctx, t.assigneeIds, { title: `${ctx.user.name} assigned you '${t.title}'`, href: `/app/work/tasks/${t.id}`, kind: 'assignment', product: 'work', event: 'task.assigned' })
  }
}
