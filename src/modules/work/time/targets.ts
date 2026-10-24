import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TimeEntry } from '@/models/work/TimeEntry'
import { canAccessProject } from '../projects/access'
import { canAccessTask } from '../tasks/access'
import { getViewer } from '../tasks/viewer'

/** A timesheet row: 'task:<id>' or 'project:<id>'. */
export type TargetKey = string
export type Target = { key: TargetKey; taskId?: Types.ObjectId; projectId?: Types.ObjectId; label: string; sub?: string; billable: boolean }

const TASK_LIMIT = 80

export const targetKeyOf = (e: { taskId?: unknown; projectId?: unknown }) => (e.taskId ? `task:${e.taskId}` : `project:${e.projectId}`)

/** A row already on my timesheet stays editable even if I have since lost access to its task or project. */
const hasOwnTime = async (ctx: Ctx, filter: Record<string, unknown>) => Boolean(await ctx.db(TimeEntry).exists({ memberId: ctx.memberId, ...filter }))

/**
 * Resolves a target key into ids and a default billable flag (true when the
 * project has a client). Only tasks and projects the member can see (as in the
 * picker), so time never lands on someone else's private task.
 */
export async function resolveTarget(ctx: Ctx, key: TargetKey): Promise<Target> {
  const [kind, id] = key.split(':')
  if (kind === 'task') {
    const task = await ctx.db(Task).findById(id).lean()
    if (!task || (!canAccessTask(await getViewer(ctx), task) && !(await hasOwnTime(ctx, { taskId: task._id })))) throw new UserError('That task was not found. Pick another one.')
    const project = task.projectId ? await ctx.db(Project).findById(task.projectId, { name: 1, clientId: 1 }).lean() : null
    return { key, taskId: task._id, projectId: task.projectId ?? undefined, label: task.title, sub: [task.key, project?.name].filter(Boolean).join(' · '), billable: Boolean(task.clientId ?? project?.clientId) }
  }
  if (kind === 'project') {
    const project = await ctx.db(Project).findById(id, { name: 1, code: 1, clientId: 1, leadId: 1, memberIds: 1, createdById: 1 }).lean()
    const open = project && (ctx.can('tasks.manage') || canAccessProject(String(ctx.memberId), ctx.can('projects.write'), project))
    if (!project || (!open && !(await hasOwnTime(ctx, { projectId: project._id, taskId: { $exists: false } })))) throw new UserError('That project was not found. Pick another one.')
    return { key, projectId: project._id, label: project.name, sub: project.code, billable: Boolean(project.clientId) }
  }
  throw new UserError('Pick a task or project')
}

/** Labels for many entries in two queries. */
export async function labelTargets(ctx: Ctx, entries: { taskId?: unknown; projectId?: unknown }[]): Promise<Map<TargetKey, { label: string; sub?: string; taskId?: string; projectId?: string }>> {
  const taskIds = [...new Set(entries.filter((e) => e.taskId).map((e) => String(e.taskId)))]
  const tasks = taskIds.length ? await ctx.db(Task).find({ _id: { $in: taskIds } }, { title: 1, key: 1, projectId: 1 }).lean() : []
  const projectIds = [...new Set([...entries.filter((e) => e.projectId).map((e) => String(e.projectId)), ...tasks.filter((t) => t.projectId).map((t) => String(t.projectId))])]
  const projects = projectIds.length ? await ctx.db(Project).find({ _id: { $in: projectIds } }, { name: 1, code: 1 }).lean() : []
  const projectById = new Map(projects.map((p) => [String(p._id), p]))
  const out = new Map<TargetKey, { label: string; sub?: string; taskId?: string; projectId?: string }>()
  for (const t of tasks) out.set(`task:${t._id}`, { label: t.title, sub: [t.key, t.projectId ? projectById.get(String(t.projectId))?.name : undefined].filter(Boolean).join(' · '), taskId: String(t._id), projectId: t.projectId ? String(t.projectId) : undefined })
  for (const p of projects) out.set(`project:${p._id}`, { label: p.name, sub: p.code, projectId: String(p._id) })
  return out
}

/** Picker options: my open tasks and the projects I'm on (everything for tasks.manage), with the default billable flag. */
export async function targetOptions(ctx: Ctx): Promise<{ value: string; label: string; hint?: string; billable: boolean }[]> {
  const me = ctx.memberId
  const projectFilter = ctx.can('tasks.manage') ? {} : { $or: [{ leadId: me }, { memberIds: me }] }
  const [tasks, projects] = await Promise.all([
    ctx.db(Task).find({ assigneeIds: me, status: { $ne: 'done' }, isPersonal: { $ne: true } }, { title: 1, key: 1, projectId: 1, clientId: 1 }).sort({ updatedAt: -1 }).limit(TASK_LIMIT).lean(),
    ctx.db(Project).find({ ...projectFilter, status: { $nin: ['completed', 'cancelled'] } }, { name: 1, code: 1, clientId: 1 }).sort({ name: 1 }).lean(),
  ])
  const known = new Set(projects.map((p) => String(p._id)))
  const missing = [...new Set(tasks.flatMap((t) => (t.projectId && !known.has(String(t.projectId)) ? [String(t.projectId)] : [])))]
  const extra = missing.length ? await ctx.db(Project).find({ _id: { $in: missing } }, { clientId: 1 }).lean() : []
  const clientOf = new Map([...projects, ...extra].map((p) => [String(p._id), p.clientId]))
  return [
    ...tasks.map((t) => ({ value: `task:${t._id}`, label: t.title, hint: t.key, billable: Boolean(t.clientId ?? (t.projectId ? clientOf.get(String(t.projectId)) : null)) })),
    ...projects.map((p) => ({ value: `project:${p._id}`, label: `Project: ${p.name}`, hint: p.code, billable: Boolean(p.clientId) })),
  ]
}
