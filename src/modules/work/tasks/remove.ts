import 'server-only'
import type { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { deleteStoredFile } from '@/lib/files'
import { Task } from '@/models/work/Task'
import { TaskActivity } from '@/models/work/TaskActivity'
import { TaskComment } from '@/models/work/TaskComment'
import { TimeEntry } from '@/models/work/TimeEntry'
import { recomputeProjectHealth } from '@/modules/work/projects/stats'
import { syncWeek } from '@/modules/work/time/ledger'
import { logActivity } from './activity-log'
import type { TaskDoc } from './load'

/**
 * Deletes a task with its subtasks, comments, activity, files and time entries.
 * Refused while any of its time is submitted or approved (a manager is looking
 * at those hours); the weeks of deleted draft time are re-totalled.
 */
export async function removeTask(ctx: Ctx, task: TaskDoc): Promise<void> {
  const children = await ctx.db(Task).find({ parentId: task._id }, { attachments: 1 }).lean()
  const ids: Types.ObjectId[] = [task._id, ...children.map((c) => c._id)]
  if (await ctx.db(TimeEntry).exists({ taskId: { $in: ids }, status: { $in: ['submitted', 'approved'] } })) {
    throw new UserError('This task has time in a submitted or approved timesheet. Ask the manager to send that week back first.')
  }
  const entries = await ctx.db(TimeEntry).find({ taskId: { $in: ids } }, { memberId: 1, weekStart: 1 }).lean()
  const weeks = new Map(entries.map((e) => [`${String(e.memberId)}|${e.weekStart}`, { memberId: e.memberId, weekStart: e.weekStart }]))
  const fileIds = [task, ...children].flatMap((t) => (t.attachments ?? []).map((a) => a.fileId).filter(Boolean))
  await Promise.all([
    ctx.db(Task).deleteMany({ _id: { $in: ids } }),
    ctx.db(TaskComment).deleteMany({ taskId: { $in: ids } }),
    ctx.db(TaskActivity).deleteMany({ taskId: { $in: ids } }),
    ctx.db(TimeEntry).deleteMany({ taskId: { $in: ids } }),
    // Relations elsewhere drop the deleted tasks.
    ctx.db(Task).updateMany({ $or: [{ blockedByIds: { $in: ids } }, { relatedIds: { $in: ids } }] }, { $pull: { blockedByIds: { $in: ids }, relatedIds: { $in: ids } } }),
  ])
  await Promise.all([...weeks.values()].map((w) => syncWeek(ctx, w.memberId, w.weekStart)))
  await Promise.all(fileIds.map((id) => deleteStoredFile(ctx.orgId, String(id))))
  if (task.parentId) await logActivity(ctx, [{ type: 'deleted', taskId: task.parentId, projectId: task.projectId, meta: { title: task.title } }])
  else if (task.projectId) await logActivity(ctx, [{ type: 'deleted', projectId: task.projectId, meta: { title: task.title } }])
  await audit(ctx, { action: 'task.deleted', entity: 'Task', entityId: task._id, summary: `Deleted task ${task.key} "${task.title}"`, product: 'work', meta: { subtasks: children.length } })
  if (!task.isPersonal) await recomputeProjectHealth(ctx, task.projectId)
}
