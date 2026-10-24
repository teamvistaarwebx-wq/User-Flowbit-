'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { objectId } from '@/lib/validation'
import { Milestone } from '@/models/work/Milestone'
import { Task } from '@/models/work/Task'
import { logActivity } from '@/modules/work/tasks/activity-log'
import { revalidateWork } from '@/modules/work/tasks/revalidate'
import { requireEditableProject } from './guard'
import { milestoneSchema } from './schemas'

const WORK = { product: 'work', perm: 'projects.read' } as const

export const createMilestone = action(
  milestoneSchema.extend({ projectId: objectId }),
  async ({ projectId, ...input }, ctx) => {
    const project = await requireEditableProject(ctx, projectId)
    const count = await ctx.db(Milestone).countDocuments({ projectId: project._id })
    await ctx.db(Milestone).create({ ...input, projectId: project._id, status: 'open', order: count })
    await logActivity(ctx, [{ type: 'milestone_added', projectId: project._id, meta: { title: input.title } }])
    revalidateWork()
    return ok(`Milestone '${input.title}' added`)
  },
  WORK,
)

async function editableMilestone(ctx: Ctx, id: string) {
  const milestone = await ctx.db(Milestone).findById(id).lean()
  if (!milestone) throw new NotFoundError('That milestone')
  await requireEditableProject(ctx, String(milestone.projectId))
  return milestone
}

export const updateMilestone = action(
  milestoneSchema.extend({ id: objectId }),
  async ({ id, ...input }, ctx) => {
    const milestone = await editableMilestone(ctx, id)
    await ctx.db(Milestone).updateOne({ _id: milestone._id }, { $set: { title: input.title, dueDate: input.dueDate, description: input.description ?? null } })
    revalidateWork()
    return ok(`Milestone '${input.title}' saved`)
  },
  WORK,
)

/** Complete or reopen. */
export const setMilestoneDone = action(
  z.object({ id: objectId, done: z.boolean() }),
  async ({ id, done }, ctx) => {
    const milestone = await editableMilestone(ctx, id)
    await ctx.db(Milestone).updateOne({ _id: milestone._id }, done ? { $set: { status: 'done', doneAt: new Date() } } : { $set: { status: 'open' }, $unset: { doneAt: '' } })
    await logActivity(ctx, [{ type: done ? 'milestone_done' : 'milestone_reopened', projectId: milestone.projectId, meta: { title: milestone.title } }])
    revalidateWork()
    return ok(done ? `Milestone '${milestone.title}' completed` : `Milestone '${milestone.title}' reopened`)
  },
  WORK,
)

/** Deleting a milestone unlinks its tasks (they stay in the project). */
export const deleteMilestone = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const milestone = await editableMilestone(ctx, id)
    await ctx.db(Task).updateMany({ milestoneId: milestone._id }, { $unset: { milestoneId: '' } })
    await ctx.db(Milestone).deleteOne({ _id: milestone._id })
    await logActivity(ctx, [{ type: 'milestone_deleted', projectId: milestone.projectId, meta: { title: milestone.title } }])
    revalidateWork()
    return ok(`Milestone '${milestone.title}' deleted`)
  },
  WORK,
)
