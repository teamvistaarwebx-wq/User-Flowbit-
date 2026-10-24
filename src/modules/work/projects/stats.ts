import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { completion, EMPTY_COUNTS, projectHealth, type ProjectCounts } from './health'

type Id = Types.ObjectId

/** Task counts per project (top-level, non-personal tasks) in one aggregate. */
export async function projectCounts(ctx: Ctx, projectIds: Id[]): Promise<Map<string, ProjectCounts>> {
  if (!projectIds.length) return new Map()
  const today = todayIST()
  const rows = await ctx.db(Task).aggregate<{ _id: Id } & ProjectCounts>([
    { $match: { projectId: { $in: projectIds }, parentId: null, isPersonal: { $ne: true } } },
    {
      $group: {
        _id: '$projectId',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $in: ['$status', ['in_progress', 'in_review']] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
        overdue: {
          $sum: {
            $cond: [{ $and: [{ $ne: ['$status', 'done'] }, { $eq: [{ $type: '$dueDate' }, 'string'] }, { $lt: ['$dueDate', today] }] }, 1, 0],
          },
        },
      },
    },
  ])
  return new Map(rows.map(({ _id, ...c }) => [String(_id), c]))
}

export const countsFor = (map: Map<string, ProjectCounts>, id: unknown) => map.get(String(id)) ?? EMPTY_COUNTS

/** Recomputes and stores a project's health, score and progress after task or date changes. */
export async function recomputeProjectHealth(ctx: Ctx, projectId: Id | string | null | undefined): Promise<void> {
  if (!projectId) return
  const project = await ctx.db(Project).findById(projectId, { startDate: 1, endDate: 1 }).lean()
  if (!project) return
  const counts = countsFor(await projectCounts(ctx, [project._id]), project._id)
  const { score, health } = projectHealth(counts, project, todayIST())
  await ctx.db(Project).updateOne({ _id: project._id }, { $set: { health, healthScore: score, progress: completion(counts) } })
}
