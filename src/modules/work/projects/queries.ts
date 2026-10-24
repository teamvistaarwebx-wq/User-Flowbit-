import 'server-only'
import { isValidObjectId, type Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { oid } from '@/lib/serialize'
import { Client } from '@/models/Client'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { canAccessProject, canEditProject, projectAccessMatch } from './access'
import { projectListMatch, projectSort, type ProjectQuery } from './filters'
import { completion, projectHealth, type ProjectCounts } from './health'
import { countsFor, projectCounts } from './stats'

export const CARD_PAGE_SIZE = 12
export const TABLE_PAGE_SIZE = 25

export type ProjectSummary = {
  id: string
  code: string
  name: string
  color: string
  /** The project logo (/api/files URL), or null to show the initials tile. */
  logoUrl: string | null
  status: string
  health: string
  healthScore: number
  progress: number
  counts: ProjectCounts
  clientId: string | null
  clientName: string | null
  leadId: string
  memberIds: string[]
  startDate: string | null
  endDate: string | null
  archived: boolean
  canEdit: boolean
}

type ProjectLean = NonNullable<Awaited<ReturnType<typeof findProject>>>

export async function findProject(ctx: Ctx, id: string) {
  return isValidObjectId(id) ? ctx.db(Project).findById(id).lean() : null
}

/** Health and progress computed live from the counts (so lists are right even before a recompute). */
export function summarize(p: ProjectLean, counts: ProjectCounts, clientName: string | null, canEdit: boolean): ProjectSummary {
  const { score, health } = projectHealth(counts, p, todayIST())
  return {
    id: String(p._id),
    code: p.code,
    name: p.name,
    color: p.color ?? '#818CF8',
    logoUrl: p.logoFileId ? fileUrl(p.logoFileId) : null,
    status: p.status,
    health,
    healthScore: score,
    progress: completion(counts),
    counts,
    clientId: p.clientId ? String(p.clientId) : null,
    clientName,
    leadId: String(p.leadId),
    memberIds: [...new Set([String(p.leadId), ...(p.memberIds ?? []).map(String)])],
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    archived: Boolean(p.archivedAt),
    canEdit,
  }
}

async function clientNames(ctx: Ctx, ids: (Types.ObjectId | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return new Map()
  const rows = await ctx.db(Client).find({ _id: { $in: unique } }, { name: 1 }).lean()
  return new Map(rows.map((c) => [String(c._id), c.name]))
}

async function summarizeAll(ctx: Ctx, rows: ProjectLean[]): Promise<ProjectSummary[]> {
  const [counts, clients] = await Promise.all([projectCounts(ctx, rows.map((r) => r._id)), clientNames(ctx, rows.map((r) => r.clientId))])
  const me = String(ctx.memberId)
  const write = ctx.can('projects.write')
  return rows.map((p) => summarize(p, countsFor(counts, p._id), p.clientId ? (clients.get(String(p.clientId)) ?? null) : null, canEditProject(me, write, p)))
}

/** Projects list (cards or table) with filters, sort and pagination. */
export async function listProjects(ctx: Ctx, q: ProjectQuery) {
  const pageSize = q.view === 'table' ? TABLE_PAGE_SIZE : CARD_PAGE_SIZE
  const me = String(ctx.memberId)
  const filter = { $and: [projectAccessMatch(me, ctx.can('projects.write'), oid), projectListMatch(q, me, oid)] }
  const [rows, total] = await Promise.all([
    ctx.db(Project).find(filter, { files: 0 }).sort(projectSort(q)).skip((q.page - 1) * pageSize).limit(pageSize).lean(),
    ctx.db(Project).countDocuments(filter),
  ])
  return { rows: await summarizeAll(ctx, rows as ProjectLean[]), total, pageSize }
}

/** Projects for the Home overview dropdown: the ones I'm on (or all with projects.write), newest activity first. */
export async function homeProjects(ctx: Ctx, limit = 20): Promise<ProjectSummary[]> {
  const rows = await ctx.db(Project)
    .find({ archivedAt: null, ...projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), oid) }, { files: 0 })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()
  return summarizeAll(ctx, rows as ProjectLean[])
}

/** A project the member may open, or null. */
export async function accessibleProject(ctx: Ctx, id: string) {
  const project = await findProject(ctx, id)
  if (!project || !canAccessProject(String(ctx.memberId), ctx.can('projects.write'), project)) return null
  return project
}

export async function projectSummary(ctx: Ctx, project: ProjectLean): Promise<ProjectSummary> {
  return (await summarizeAll(ctx, [project]))[0]
}

/**
 * For the shared Clients pages (orbit): projects and task numbers for a client.
 * Tasks count when their clientId is the client or their project belongs to it.
 */
export async function getClientWorkSummary(ctx: Ctx, clientId: string) {
  if (!isValidObjectId(clientId)) return null
  const id = oid(clientId)
  const projects = await ctx.db(Project).find({ clientId: id }, { files: 0 }).sort({ updatedAt: -1 }).lean()
  const projectIds = projects.map((p) => p._id)
  const today = todayIST()
  const [stats] = await ctx.db(Task).aggregate<{ total: number; completed: number; inProgress: number; todo: number; overdue: number }>([
    { $match: { isPersonal: { $ne: true }, parentId: null, $or: [{ clientId: id }, { projectId: { $in: projectIds } }] } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $in: ['$status', ['in_progress', 'in_review']] }, 1, 0] } },
        todo: { $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'done'] }, { $eq: [{ $type: '$dueDate' }, 'string'] }, { $lt: ['$dueDate', today] }] }, 1, 0] } },
      },
    },
  ])
  const tasks = stats ?? { total: 0, completed: 0, inProgress: 0, todo: 0, overdue: 0 }
  const list = await summarizeAll(ctx, projects as ProjectLean[])
  return {
    projects: { total: projects.length, active: projects.filter((p) => p.status === 'active' && !p.archivedAt).length, list },
    tasks: { ...tasks, completionPercentage: tasks.total ? Math.round((tasks.completed / tasks.total) * 100) : 0 },
  }
}
