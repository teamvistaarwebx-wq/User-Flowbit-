import 'server-only'
import { isValidObjectId } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { Task } from '@/models/work/Task'
import { canAccessTask, canModifyTask, type Viewer } from './access'

export async function findTask(ctx: Ctx, id: string) {
  return isValidObjectId(id) ? ctx.db(Task).findById(id).lean() : null
}

export type TaskDoc = NonNullable<Awaited<ReturnType<typeof findTask>>>

/** A task the viewer may see (or edit), else a NotFound/Forbidden error the action turns into a toast. */
export async function requireTask(ctx: Ctx, viewer: Viewer, id: string, mode: 'view' | 'edit' = 'view'): Promise<TaskDoc> {
  const task = await findTask(ctx, id)
  if (!task) throw new NotFoundError('That task')
  if (!canAccessTask(viewer, task)) throw new ForbiddenError("You don't have access to that task")
  if (mode === 'edit' && !canModifyTask(viewer, task)) throw new ForbiddenError("You can't edit this task. Ask its creator or an assignee.")
  return task
}
