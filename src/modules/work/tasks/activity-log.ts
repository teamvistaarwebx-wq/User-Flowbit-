import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { TaskActivity } from '@/models/work/TaskActivity'
import type { ActivityType } from './activity'

export type ActivityInput = {
  type: ActivityType
  taskId?: Types.ObjectId | string | null
  projectId?: Types.ObjectId | string | null
  from?: unknown
  to?: unknown
  meta?: Record<string, unknown>
}

/** Writes task/project timeline rows for the acting member. */
export async function logActivity(ctx: Ctx, rows: ActivityInput[]): Promise<void> {
  if (!rows.length) return
  await ctx.db(TaskActivity).insertMany(
    rows.map((r) => ({
      type: r.type,
      taskId: r.taskId ?? undefined,
      projectId: r.projectId ?? undefined,
      actorId: ctx.memberId,
      from: r.from,
      to: r.to,
      meta: r.meta,
    })),
  )
}
