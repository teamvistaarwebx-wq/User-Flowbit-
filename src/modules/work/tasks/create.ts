import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { formatSeq, nextSeq, prefixFrom } from '@/lib/sequence'
import { recordUsage } from '@/lib/usage'
import { fireWebhookEvent } from '@/modules/webhooks/emit'
import { Task } from '@/models/work/Task'
import { recomputeProjectHealth } from '@/modules/work/projects/stats'
import { canModifyTask, type Viewer } from './access'
import type { TaskPriority, TaskStatus } from './constants'
import { logActivity, type ActivityInput } from './activity-log'
import { requireTask } from './load'
import { notifyAssigned } from './notify'
import { checkAssignees, checkDateYears, checkDates, checkTitle, cleanTags, resolveClient, resolveMilestone, resolveProject, resolveSpaceFolder } from './validate'

export type NewTask = {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  assigneeIds?: string[]
  startDate?: string
  dueDate?: string
  /** 'HH:mm' (IST); kept only with a due date. */
  dueTime?: string
  projectId?: string
  spaceId?: string
  folderId?: string
  clientId?: string
  milestoneId?: string
  tags?: string[]
  estimateMinutes?: number
  blockedReason?: string
  /** Created from the Personal view: the server makes it private to the creator. */
  personal?: boolean
  parentId?: string
  /** Where it came from (AI app, Slack, email, webhook): shown on the timeline as "created this task from Slack #design". */
  origin?: TaskOrigin
}

export type TaskOrigin = Readonly<{ kind: string; ref?: string; url?: string; label: string; via?: string }>

type Location = { projectId?: Types.ObjectId; spaceId?: Types.ObjectId; folderId?: Types.ObjectId; clientId?: Types.ObjectId; milestoneId?: Types.ObjectId; isPersonal: boolean }

/** Where the task lives: inherited from the parent for subtasks, checked against access otherwise. */
async function resolveLocation(ctx: Ctx, viewer: Viewer, input: NewTask): Promise<Location> {
  if (input.parentId) {
    const parent = await requireTask(ctx, viewer, input.parentId)
    if (!canModifyTask(viewer, parent)) throw new UserError("You can't add subtasks to this task. Ask its creator or an assignee.")
    if (parent.parentId) throw new UserError("Subtasks can't have their own subtasks.")
    return {
      projectId: parent.projectId ?? undefined, spaceId: parent.spaceId ?? undefined, folderId: parent.folderId ?? undefined,
      clientId: parent.clientId ?? undefined, milestoneId: parent.milestoneId ?? undefined, isPersonal: Boolean(parent.isPersonal),
    }
  }
  if (input.personal) {
    if (input.projectId || input.spaceId || input.folderId) throw new UserError('Personal tasks stay out of projects and spaces.')
    return { isPersonal: true }
  }
  const out: Location = { isPersonal: false }
  if (input.projectId) {
    const project = await resolveProject(ctx, viewer, input.projectId)
    out.projectId = project._id
    out.clientId = project.clientId ?? undefined
  }
  if (input.spaceId || input.folderId) {
    const { space, folder } = await resolveSpaceFolder(ctx, viewer, input.spaceId ?? '', input.folderId)
    out.spaceId = space._id
    out.folderId = folder._id
  }
  if (input.clientId) out.clientId = (await resolveClient(ctx, input.clientId))._id
  if (input.milestoneId) out.milestoneId = (await resolveMilestone(ctx, input.milestoneId, out.projectId))._id
  return out
}

/** Next task key, e.g. 'VW-42' (prefix from the workspace name). */
export async function nextTaskKey(ctx: Ctx): Promise<string> {
  const n = await nextSeq(ctx.orgId, 'task')
  return formatSeq(n, { prefix: `${prefixFrom(ctx.org.name) || 'FB'}-` })
}

/** Lowest order in a status column minus one, so new cards land on top. */
async function topOrder(ctx: Ctx, status: TaskStatus): Promise<number> {
  const firstCard = await ctx.db(Task).findOne({ status }, { order: 1 }).sort({ order: 1 }).lean()
  return (firstCard?.order ?? 1) - 1
}

/** Creates a task (or subtask) with activity, notifications and project health. */
export async function createTaskRecord(ctx: Ctx, viewer: Viewer, input: NewTask) {
  const title = checkTitle(input.title)
  checkDateYears(input.startDate, input.dueDate)
  checkDates(input.startDate, input.dueDate)
  const where = await resolveLocation(ctx, viewer, input)
  const status = input.status ?? 'todo'
  const reason = input.blockedReason?.trim()
  if (status === 'blocked' && !reason) throw new UserError('Say why this task is blocked.', { blockedReason: 'Say why this task is blocked' })
  const assignees = await checkAssignees(ctx, input.assigneeIds?.length ? input.assigneeIds : [String(ctx.memberId)], { personal: where.isPersonal })
  const now = new Date()
  const task = await ctx.db(Task).create({
    key: await nextTaskKey(ctx),
    title,
    description: input.description?.trim() || undefined,
    status,
    priority: input.priority ?? 'medium',
    assigneeIds: assignees,
    creatorId: ctx.memberId,
    ...where,
    parentId: input.parentId ?? null,
    startDate: input.startDate,
    dueDate: input.dueDate,
    dueTime: input.dueDate ? input.dueTime : undefined,
    startedAt: status === 'in_progress' || status === 'in_review' ? now : undefined,
    completedAt: status === 'done' ? now : undefined,
    blockedReason: status === 'blocked' ? reason : undefined,
    blockedAt: status === 'blocked' ? now : undefined,
    blockedById: status === 'blocked' ? ctx.memberId : undefined,
    watcherIds: [...new Set([String(ctx.memberId), ...assignees.map(String)])],
    tags: cleanTags(input.tags ?? []),
    estimateMinutes: input.estimateMinutes,
    order: await topOrder(ctx, status),
    origin: input.origin ? { kind: input.origin.kind, ref: input.origin.ref, url: input.origin.url, label: input.origin.label, via: input.origin.via } : undefined,
  })
  const createdMeta = input.origin ? { source: input.origin.label, ...(input.origin.via ? { via: input.origin.via } : {}) } : undefined
  const rows: ActivityInput[] = [{ type: 'created', taskId: task._id, projectId: task.projectId, meta: createdMeta }]
  if (status === 'blocked') rows.push({ type: 'blocked', taskId: task._id, projectId: task.projectId, to: reason })
  if (input.parentId) rows.push({ type: 'subtask_added', taskId: input.parentId, projectId: task.projectId, meta: { title } })
  await logActivity(ctx, rows)
  await notifyAssigned(ctx, task, assignees.map(String))
  if (task.projectId && !task.isPersonal) await recomputeProjectHealth(ctx, task.projectId)
  recordUsage({ kind: 'task_created', orgId: ctx.orgId, userId: ctx.userId, product: 'work' })
  if (!input.parentId && !task.isPersonal) fireWebhookEvent(ctx.orgId, 'task.created', { id: String(task._id), key: task.key, title: task.title, status: task.status, priority: task.priority, due_date: task.dueDate ?? null, path: `/app/work/tasks/${task._id}`, source: input.origin?.label ?? null })
  return task
}
