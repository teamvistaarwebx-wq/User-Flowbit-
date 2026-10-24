'use server'

import { revalidatePath } from 'next/cache'
import type { ClientSession, Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { NotFoundError, UserError } from '@/lib/errors'
import { nextSeq } from '@/lib/sequence'
import { pluralize } from '@/lib/utils'
import { objectId } from '@/lib/validation'
import { ArcRun } from '@/models/work/ArcRun'
import { Milestone } from '@/models/work/Milestone'
import { Post } from '@/models/work/Post'
import { Project } from '@/models/work/Project'
import { requireEditableProject } from '../projects/guard'
import { canModifyTask } from '../tasks/access'
import { requireTask } from '../tasks/load'
import { activeMemberIds } from '../tasks/people'
import { getViewer } from '../tasks/viewer'
import { applyBreakdownSchema, applyOutlineSchema } from './schemas'
import { afterTasksCreated, createTasks, type CreatedTask } from './task-writer'

const W = { product: 'work', perm: 'arc.use' } as const
type ProjectRef = { _id: Types.ObjectId; name: string; clientId?: Types.ObjectId }

/**
 * Marks the draft applied inside the transaction, only while it is still a
 * draft: a second click or tab finds it taken and creates nothing.
 */
async function claimDraft(ctx: Ctx, runId: Types.ObjectId, applied: Record<string, unknown>, session: ClientSession) {
  const res = await ctx.db(ArcRun).updateOne({ _id: runId, status: 'draft' }, { $set: { status: 'applied', appliedAt: new Date(), applied } }, { session })
  if (!res.modifiedCount) throw new UserError('This draft was already applied.')
}

async function openDraft(ctx: Ctx, runId: string, kind: 'outline' | 'breakdown') {
  const run = await ctx.db(ArcRun).findOne({ _id: runId, memberId: ctx.memberId, kind }).lean()
  if (!run) throw new NotFoundError('That draft')
  return run
}

/** Next free PROJ-001 style code (skips codes people typed by hand). */
async function projectCode(ctx: Ctx, session: ClientSession): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const code = `PROJ-${String(await nextSeq(ctx.orgId, 'project', session)).padStart(3, '0')}`
    if (!(await ctx.db(Project).exists({ code }))) return code
  }
  return `PROJ-${Date.now().toString(36).toUpperCase()}`
}

async function createProject(ctx: Ctx, session: ClientSession, p: { name: string; goal?: string; startDate: string; endDate?: string }): Promise<ProjectRef> {
  const created = await ctx.db(Project).create(
    { code: await projectCode(ctx, session), name: p.name, description: p.goal, status: 'planning', health: 'on_track', healthScore: 75, leadId: ctx.memberId, memberIds: [ctx.memberId], startDate: p.startDate, endDate: p.endDate, color: '#C084FC', tags: [], createdById: ctx.memberId },
    { session },
  )
  return { _id: created._id as Types.ObjectId, name: created.name, clientId: created.clientId ?? undefined }
}

export const applyOutline = action(
  applyOutlineSchema,
  async (input, ctx) => {
    const run = await openDraft(ctx, input.runId, 'outline')
    if (run.status !== 'draft') return fail(run.status === 'applied' ? 'This draft was already applied.' : 'This draft was discarded.')
    ctx.assert('tasks.write')
    if (!input.projectId) ctx.assert('projects.write', 'Only people who can create projects can apply a new project outline. Pick an existing project instead.')
    if (!input.projectId && !input.projectName) return fail('Some fields need attention.', { projectName: 'Project name is required' })
    const end = input.milestones.map((m) => m.dueDate).sort().at(-1)
    // Adding milestones and tasks to an existing project needs the same rights as doing it by hand.
    const existing = input.projectId ? await requireEditableProject(ctx, input.projectId) : null
    if (existing?.archivedAt) return fail('That project is archived. Restore it first, or pick another project.')
    const result = await withTransaction(async (session) => {
      const project: ProjectRef = existing
        ? { _id: existing._id as Types.ObjectId, name: existing.name, clientId: existing.clientId ?? undefined }
        : await createProject(ctx, session, { name: input.projectName as string, goal: (run.output as { goal?: string })?.goal, startDate: input.startDate, endDate: end })
      const milestoneIds: Types.ObjectId[] = []
      const created: CreatedTask[] = []
      for (const [i, m] of input.milestones.entries()) {
        const milestone = await ctx.db(Milestone).create({ projectId: project._id, title: m.title, dueDate: m.dueDate, status: 'open', order: i }, { session })
        milestoneIds.push(milestone._id as Types.ObjectId)
        created.push(...(await createTasks(ctx, m.tasks.map((t) => ({ title: t.title, priority: t.priority, estimateMinutes: t.estimateMinutes, projectId: project._id, milestoneId: milestone._id as Types.ObjectId, clientId: project.clientId ?? undefined, dueDate: m.dueDate })), session)))
      }
      await claimDraft(ctx, run._id, { projectId: project._id, taskIds: created.map((t) => t.id), milestoneIds }, session)
      return { project, created, milestoneIds, isNew: !input.projectId }
    })
    await afterTasksCreated(ctx, result.created)
    if (result.isNew) await audit(ctx, { action: 'project.created', entity: 'Project', entityId: result.project._id, summary: `Created project ${result.project.name} from an Arc outline`, product: 'work' })
    revalidatePath('/app/arc')
    revalidatePath('/app/work/projects')
    revalidatePath('/app', 'layout')
    return ok(`Added ${pluralize(result.milestoneIds.length, 'milestone')} and ${pluralize(result.created.length, 'task')} to ${result.project.name}`, { projectId: String(result.project._id) }, `/app/work/projects/${result.project._id}`)
  },
  W,
)

export const applyBreakdown = action(
  applyBreakdownSchema,
  async (input, ctx) => {
    const run = await openDraft(ctx, input.runId, 'breakdown')
    if (run.status !== 'draft') return fail(run.status === 'applied' ? 'This draft was already applied.' : 'This draft was discarded.')
    ctx.assert('tasks.write')
    const parentId = (run.output as { taskId?: string })?.taskId
    if (!parentId) throw new NotFoundError('The parent task')
    const viewer = await getViewer(ctx)
    const parent = await requireTask(ctx, viewer, parentId)
    // Same rule as adding subtasks by hand.
    if (!canModifyTask(viewer, parent)) return fail("You can't add subtasks to this task. Ask its creator or an assignee.")
    if (parent.parentId) return fail("Subtasks can't have their own subtasks.")
    const active = await activeMemberIds(ctx, parent.assigneeIds.map(String))
    const assigneeIds = parent.assigneeIds.map(String).filter((id) => active.has(id))
    const created = await withTransaction(async (session) => {
      const tasks = await createTasks(ctx, input.subtasks.map((s) => ({ title: s.title, estimateMinutes: s.estimateMinutes, parentId: parent._id, projectId: parent.projectId ?? undefined, clientId: parent.clientId ?? undefined, assigneeIds, dueDate: parent.dueDate ?? undefined })), session)
      await claimDraft(ctx, run._id, { taskIds: tasks.map((t) => t.id) }, session)
      return tasks
    })
    await afterTasksCreated(ctx, created)
    revalidatePath('/app/arc')
    revalidatePath(`/app/work/tasks/${parent._id}`)
    return ok(`Added ${pluralize(created.length, 'subtask')} to '${parent.title}'`, undefined, `/app/work/tasks/${parent._id}`)
  },
  W,
)

/** "Post as update": publishes the progress text as an Update post after the person clicks. */
export const postProgressUpdate = action(
  z.object({ runId: objectId }),
  async ({ runId }, ctx) => {
    ctx.assert('posts.write')
    const run = await ctx.db(ArcRun).findOne({ _id: runId, memberId: ctx.memberId, kind: 'progress' }).lean()
    if (!run) throw new NotFoundError('That update')
    const out = run.output as { text?: string; periodLabel?: string; scopeLabel?: string }
    if (run.applied?.postId) return ok('Already posted', undefined, `/app/work/posts/${run.applied.postId}`)
    const post = await ctx.db(Post).create({ authorId: ctx.memberId, title: `Progress update: ${out.periodLabel ?? 'this week'}`.slice(0, 200), message: (out.text ?? '').slice(0, 5000) || 'No activity to report.', category: 'update', audience: 'org', reads: [{ memberId: ctx.memberId, readAt: new Date() }], lastActivityAt: new Date() })
    await ctx.db(ArcRun).updateOne({ _id: run._id }, { $set: { 'applied.postId': post._id, appliedAt: new Date() } })
    revalidatePath('/app/work/posts')
    revalidatePath('/app/arc')
    return ok('Posted to Posts as an update', undefined, `/app/work/posts/${post._id}`)
  },
  W,
)
