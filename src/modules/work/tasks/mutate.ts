import 'server-only'
import type { Types, UpdateQuery } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import type { RawOf } from '@/lib/db/scoped'
import { ForbiddenError, UserError } from '@/lib/errors'
import { recordUsage } from '@/lib/usage'
import { fireWebhookEvent } from '@/modules/webhooks/emit'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TimeEntry } from '@/models/work/TimeEntry'
import { recomputeProjectHealth } from '@/modules/work/projects/stats'
import { canModifyTask, type Viewer } from './access'
import type { TaskPriority, TaskStatus } from './constants'
import { logActivity, type ActivityInput } from './activity-log'
import type { TaskDoc } from './load'
import { notifyAssigned, notifyBlocked, notifyStatus, notifyUnblocked } from './notify'
import { clientAfterProjectMove } from './client-follow'
import { logBlockerDone } from './relations'
import { checkAssignees, checkDateYears, checkDates, checkTitle, cleanTags, resolveClient, resolveMilestone, resolveProject, resolveSpaceFolder } from './validate'

/** Fields one edit may change. `null` clears a field. */
export type TaskPatch = {
  title?: string
  description?: string | null
  status?: TaskStatus
  blockedReason?: string
  blockedMentionIds?: string[]
  priority?: TaskPriority
  assigneeIds?: string[]
  startDate?: string | null
  dueDate?: string | null
  estimateMinutes?: number | null
  tags?: string[]
  projectId?: string | null
  spaceId?: string | null
  folderId?: string | null
  milestoneId?: string | null
  clientId?: string | null
}

type Draft = {
  set: Record<string, unknown>
  unset: Record<string, ''>
  acts: ActivityInput[]
  watchers: Types.ObjectId[]
  newlyAssigned: string[]
  status?: { from: string; to: TaskStatus; reason?: string; mentionIds?: string[] }
  locationChanged: boolean
}

const str = (v: unknown) => (v == null ? null : String(v))
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
const setOrUnset = (d: Draft, key: string, value: unknown) => {
  if (value == null || value === '') d.unset[key] = ''
  else d.set[key] = value
}

function patchBasics(task: TaskDoc, p: TaskPatch, d: Draft): void {
  if (p.title !== undefined) {
    const title = checkTitle(p.title)
    if (title !== task.title) {
      d.set.title = title
      d.acts.push({ type: 'title_changed', from: task.title, to: title })
    }
  }
  if (p.description !== undefined) {
    const next = p.description?.trim() || null
    if (next !== (task.description ?? null)) {
      setOrUnset(d, 'description', next)
      d.acts.push({ type: 'description_updated' })
    }
  }
  if (p.priority && p.priority !== task.priority) {
    d.set.priority = p.priority
    d.acts.push({ type: 'priority_changed', from: task.priority, to: p.priority })
  }
  if (p.estimateMinutes !== undefined && (p.estimateMinutes ?? null) !== (task.estimateMinutes ?? null)) {
    setOrUnset(d, 'estimateMinutes', p.estimateMinutes)
    d.acts.push({ type: 'estimate_changed', from: task.estimateMinutes ?? null, to: p.estimateMinutes })
  }
  if (p.tags) {
    const tags = cleanTags(p.tags)
    if (!sameSet(tags, task.tags ?? [])) {
      d.set.tags = tags
      d.acts.push({ type: 'tags_changed', from: task.tags ?? [], to: tags })
    }
  }
}

function patchStatus(ctx: Ctx, task: TaskDoc, p: TaskPatch, d: Draft): void {
  const reason = p.blockedReason?.trim().slice(0, 1000)
  if (!p.status || p.status === task.status) {
    if (task.status === 'blocked' && reason && reason !== task.blockedReason) {
      d.set.blockedReason = reason
      d.acts.push({ type: 'blocked', to: reason })
      d.status = { from: 'blocked', to: 'blocked', reason, mentionIds: p.blockedMentionIds }
    }
    return
  }
  const from = task.status
  const to = p.status
  const now = new Date()
  if (to === 'blocked') {
    if (!reason) throw new UserError('Say why this task is blocked.', { blockedReason: 'Say why this task is blocked' })
    Object.assign(d.set, { blockedReason: reason, blockedAt: now, blockedById: ctx.memberId })
  }
  if (from === 'blocked') Object.assign(d.unset, { blockedReason: '', blockedAt: '', blockedById: '' })
  if (to === 'done') d.set.completedAt = now
  else if (from === 'done') d.unset.completedAt = ''
  if ((to === 'in_progress' || to === 'in_review') && !task.startedAt) d.set.startedAt = now
  d.set.status = to
  d.acts.push({ type: 'status_changed', from, to })
  if (to === 'blocked') d.acts.push({ type: 'blocked', to: reason })
  d.status = { from, to, reason, mentionIds: p.blockedMentionIds }
}

async function patchPeople(ctx: Ctx, task: TaskDoc, p: TaskPatch, d: Draft): Promise<void> {
  if (!p.assigneeIds) return
  const next = await checkAssignees(ctx, p.assigneeIds, { personal: Boolean(task.isPersonal) })
  const before = (task.assigneeIds ?? []).map(String)
  const after = next.map(String)
  if (sameSet(before, after)) return
  d.set.assigneeIds = next
  d.acts.push({ type: 'assignees_changed', from: before, to: after })
  d.newlyAssigned = after.filter((id) => !before.includes(id))
  d.watchers.push(...next.filter((id) => d.newlyAssigned.includes(String(id))))
}

function patchDates(task: TaskDoc, p: TaskPatch, d: Draft): void {
  if (p.startDate === undefined && p.dueDate === undefined) return
  const start = p.startDate !== undefined ? p.startDate : (task.startDate ?? null)
  const due = p.dueDate !== undefined ? p.dueDate : (task.dueDate ?? null)
  checkDateYears(p.startDate, p.dueDate)
  checkDates(start, due)
  if (p.startDate !== undefined && (p.startDate ?? null) !== (task.startDate ?? null)) {
    setOrUnset(d, 'startDate', p.startDate)
    d.acts.push({ type: 'start_date_changed', from: task.startDate ?? null, to: p.startDate })
  }
  if (p.dueDate !== undefined && (p.dueDate ?? null) !== (task.dueDate ?? null)) {
    setOrUnset(d, 'dueDate', p.dueDate)
    // A time read by quick add belonged to the old date.
    if (task.dueTime) d.unset.dueTime = ''
    d.acts.push({ type: 'due_date_changed', from: task.dueDate ?? null, to: p.dueDate })
  }
}

async function patchProject(ctx: Ctx, viewer: Viewer, task: TaskDoc, p: TaskPatch, d: Draft): Promise<void> {
  if (p.projectId === undefined || str(p.projectId) === str(task.projectId)) return
  const project = p.projectId ? await resolveProject(ctx, viewer, p.projectId) : null
  if (project) {
    d.set.projectId = project._id
    d.acts.push({ type: 'project_changed', meta: { name: project.name } })
  } else {
    d.unset.projectId = ''
    d.acts.push({ type: 'project_changed', meta: {} })
  }
  if (p.clientId === undefined) {
    // A client inherited from the old project follows the task to the new one.
    const old = task.projectId ? await ctx.db(Project).findById(task.projectId, { clientId: 1 }).lean() : null
    const client = clientAfterProjectMove(str(task.clientId), str(old?.clientId), str(project?.clientId))
    if (client === null) d.unset.clientId = ''
    else if (client) d.set.clientId = project?.clientId
  }
  if (task.milestoneId && p.milestoneId === undefined) d.unset.milestoneId = ''
  d.locationChanged = true
}

async function patchSpace(ctx: Ctx, viewer: Viewer, task: TaskDoc, p: TaskPatch, d: Draft): Promise<void> {
  const spaceId = p.spaceId !== undefined ? p.spaceId : str(task.spaceId)
  const folderId = p.folderId !== undefined ? p.folderId : str(task.folderId)
  if (str(spaceId) === str(task.spaceId) && str(folderId) === str(task.folderId)) return
  if (spaceId) {
    const { space, folder } = await resolveSpaceFolder(ctx, viewer, spaceId, folderId)
    Object.assign(d.set, { spaceId: space._id, folderId: folder._id })
    d.acts.push({ type: 'space_changed', meta: { name: `${space.name} / ${folder.name}` } })
  } else {
    Object.assign(d.unset, { spaceId: '', folderId: '' })
    d.acts.push({ type: 'space_changed', meta: {} })
  }
  d.locationChanged = true
}

async function patchLinks(ctx: Ctx, task: TaskDoc, p: TaskPatch, d: Draft): Promise<void> {
  if (p.milestoneId !== undefined && str(p.milestoneId) !== str(task.milestoneId)) {
    const projectId = (d.set.projectId as Types.ObjectId | undefined) ?? ('projectId' in d.unset ? null : task.projectId)
    if (p.milestoneId) {
      const milestone = await resolveMilestone(ctx, p.milestoneId, projectId)
      d.set.milestoneId = milestone._id
      d.acts.push({ type: 'milestone_changed', meta: { name: milestone.title } })
    } else {
      d.unset.milestoneId = ''
      d.acts.push({ type: 'milestone_changed', meta: {} })
    }
  }
  if (p.clientId !== undefined && str(p.clientId) !== str(task.clientId)) {
    if (p.clientId) {
      const client = await resolveClient(ctx, p.clientId)
      d.set.clientId = client._id
      d.acts.push({ type: 'client_changed', meta: { name: client.name } })
    } else {
      d.unset.clientId = ''
      d.acts.push({ type: 'client_changed', meta: {} })
    }
  }
}

function guardLocation(task: TaskDoc, p: TaskPatch): void {
  const projectMoves = p.projectId !== undefined && str(p.projectId) !== str(task.projectId)
  const spaceMoves = (p.spaceId !== undefined && str(p.spaceId) !== str(task.spaceId)) || (p.folderId !== undefined && str(p.folderId) !== str(task.folderId))
  if (task.isPersonal && ((projectMoves && p.projectId) || (spaceMoves && (p.spaceId || p.folderId)))) throw new UserError('Personal tasks stay out of projects and spaces.')
  if (task.parentId && (projectMoves || spaceMoves)) throw new UserError('Subtasks follow their parent task. Move the parent instead.')
}

/** Side effects after the write: subtasks follow the parent, parent timeline, notifications, project health. */
async function afterPatch(ctx: Ctx, task: TaskDoc, d: Draft): Promise<void> {
  const next = { ...task, ...d.set, watcherIds: [...(task.watcherIds ?? []), ...d.watchers] } as TaskDoc
  if (d.locationChanged && !task.parentId) {
    const follow = { projectId: next.projectId ?? null, spaceId: next.spaceId ?? null, folderId: next.folderId ?? null, clientId: next.clientId ?? null }
    if ('projectId' in d.unset) follow.projectId = null
    if ('spaceId' in d.unset) Object.assign(follow, { spaceId: null, folderId: null })
    if ('clientId' in d.unset) follow.clientId = null
    await ctx.db(Task).updateMany({ parentId: task._id }, { $set: follow })
    // Logged time follows the task to its new project (reports group time by TimeEntry.projectId).
    if ('projectId' in d.set || 'projectId' in d.unset) {
      const subtasks = await ctx.db(Task).find({ parentId: task._id }, { _id: 1 }).lean()
      const taskIds = [task._id, ...subtasks.map((t) => t._id)]
      await ctx.db(TimeEntry).updateMany({ taskId: { $in: taskIds } }, follow.projectId ? { $set: { projectId: follow.projectId } } : { $unset: { projectId: '' } })
    }
  }
  if (task.parentId && d.status && (d.status.to === 'done' || d.status.from === 'done')) {
    await logActivity(ctx, [{ type: d.status.to === 'done' ? 'subtask_completed' : 'subtask_reopened', taskId: task.parentId, projectId: task.projectId, meta: { title: next.title } }])
  }
  if (d.newlyAssigned.length) await notifyAssigned(ctx, next, d.newlyAssigned)
  if (d.status?.to === 'done') await logBlockerDone(ctx, next)
  if (d.status?.to === 'done' && d.status.from !== 'done' && !task.isPersonal) fireWebhookEvent(ctx.orgId, 'task.completed', { id: String(task._id), key: task.key, title: next.title, path: `/app/work/tasks/${task._id}` })
  if (d.status?.to === 'blocked') {
    const lead = next.projectId ? (await ctx.db(Project).findById(next.projectId, { leadId: 1 }).lean())?.leadId : undefined
    await notifyBlocked(ctx, next, d.status.reason ?? '', { projectLeadId: lead, mentionIds: d.status.mentionIds })
  } else if (d.status?.from === 'blocked') await notifyUnblocked(ctx, next)
  else if (d.status) await notifyStatus(ctx, next, d.status.to)
  const affectsHealth = d.status || 'dueDate' in d.set || 'dueDate' in d.unset || d.locationChanged
  if (affectsHealth && !task.isPersonal) {
    await recomputeProjectHealth(ctx, task.projectId)
    if (str(next.projectId) !== str(task.projectId) && !('projectId' in d.unset)) await recomputeProjectHealth(ctx, next.projectId)
  }
}

/**
 * Applies one edit to a task: validates, writes, logs a TaskActivity row per
 * change, notifies the right people and keeps project health current.
 * Returns the activity types written (empty when nothing changed).
 */
export async function applyTaskPatch(ctx: Ctx, viewer: Viewer, task: TaskDoc, patch: TaskPatch): Promise<string[]> {
  if (!canModifyTask(viewer, task)) throw new ForbiddenError("You can't edit this task. Ask its creator or an assignee.")
  guardLocation(task, patch)
  const d: Draft = { set: {}, unset: {}, acts: [], watchers: [], newlyAssigned: [], locationChanged: false }
  patchBasics(task, patch, d)
  patchStatus(ctx, task, patch, d)
  patchDates(task, patch, d)
  await patchPeople(ctx, task, patch, d)
  await patchProject(ctx, viewer, task, patch, d)
  await patchSpace(ctx, viewer, task, patch, d)
  await patchLinks(ctx, task, patch, d)
  if (!Object.keys(d.set).length && !Object.keys(d.unset).length) return []

  const update: UpdateQuery<RawOf<typeof Task>> = {}
  if (Object.keys(d.set).length) update.$set = d.set
  if (Object.keys(d.unset).length) update.$unset = d.unset
  if (d.watchers.length) update.$addToSet = { watcherIds: { $each: d.watchers } }
  await ctx.db(Task).updateOne({ _id: task._id }, update)

  const projectId = (d.set.projectId as Types.ObjectId | undefined) ?? task.projectId ?? null
  await logActivity(ctx, d.acts.map((a) => ({ ...a, taskId: task._id, projectId })))
  await afterPatch(ctx, task, d)
  if (d.status && d.status.from !== d.status.to) recordUsage({ kind: 'task_moved', orgId: ctx.orgId, userId: ctx.userId, product: 'work', meta: { to: d.status.to } })
  return d.acts.map((a) => a.type)
}
