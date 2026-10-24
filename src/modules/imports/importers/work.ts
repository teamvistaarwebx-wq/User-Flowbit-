import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { nextSeq } from '@/lib/sequence'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { nextTaskKey } from '@/modules/work/tasks/create'
import { sheetRows } from '../sheet'
import type { Importer } from '../types'
import { key, unknownHeaders } from './common'
import { checkProjectRows, checkTaskRows, PROJECT_COLUMNS, TASK_COLUMNS, type ProjectRecord, type TaskRecord, type WorkLookups } from './work-rules'

/** Work projects and tasks (new importers, console spec 9). */

async function workLookups(ctx: Ctx): Promise<WorkLookups> {
  const [members, clients, projects] = await Promise.all([
    ctx.db(Member).find({ status: 'active' }, { userId: 1 }).lean(),
    ctx.db(Client).find({}, { name: 1 }).lean(),
    ctx.db(Project).find({ archivedAt: null }, { code: 1, name: 1 }).lean(),
  ])
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { email: 1 }).lean()
  const memberOf = new Map(members.map((m) => [String(m.userId), String(m._id)]))
  return {
    members: new Map(users.flatMap((u) => (memberOf.get(String(u._id)) ? [[u.email, memberOf.get(String(u._id))!] as [string, string]] : []))),
    clients: new Map(clients.map((c) => [key(c.name), String(c._id)])),
    projectCodes: new Set(projects.map((p) => p.code.toUpperCase())),
    projects: new Map(projects.flatMap((p) => [[key(p.code), String(p._id)], [key(p.name), String(p._id)]] as [string, string][])),
  }
}

/** Next free PROJ-001 style code (skips codes people typed by hand). */
async function projectCode(ctx: Ctx, taken: Set<string>): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const code = `PROJ-${String(await nextSeq(ctx.orgId, 'project')).padStart(3, '0')}`
    if (!taken.has(code)) return code
  }
  return `PROJ-${Date.now().toString(36).toUpperCase()}`
}

export const projectsImporter: Importer<ProjectRecord> = {
  kind: 'projects',
  label: 'Projects',
  description: 'Work projects with their client, lead, status and dates.',
  product: 'work',
  perm: 'projects.write',
  maxRows: 500,
  columns: PROJECT_COLUMNS,
  check: async (sheet, ctx) => {
    const { headers, rows } = sheetRows(sheet)
    return { ignored: unknownHeaders(headers, ['name', 'project', 'project_name', 'code', 'project_code', 'client', 'lead_email', 'lead', 'owner_email', 'status', 'start_date', 'start', 'end_date', 'end', 'due_date', 'description']), rows: checkProjectRows(rows, await workLookups(ctx)) }
  },
  commit: async (records, ctx) => {
    const taken = new Set((await ctx.db(Project).find({}, { code: 1 }).lean()).map((p) => p.code.toUpperCase()))
    const docs = []
    for (const r of records) {
      const code = r.code ?? (await projectCode(ctx, taken))
      taken.add(code)
      const leadId = r.leadId ?? String(ctx.memberId)
      docs.push({ code, name: r.name, description: r.description, clientId: r.clientId, status: r.status, leadId, memberIds: [leadId], startDate: r.startDate, endDate: r.endDate, createdById: ctx.memberId })
    }
    const inserted = await ctx.db(Project).insertMany(docs)
    return { created: [{ model: 'Project', ids: inserted.map((d) => d._id as Types.ObjectId) }], count: inserted.length }
  },
}

export const tasksImporter: Importer<TaskRecord> = {
  kind: 'tasks',
  label: 'Tasks',
  description: 'Work tasks with their project, assignee, status, priority and due date.',
  product: 'work',
  perm: 'tasks.write',
  maxRows: 2000,
  columns: TASK_COLUMNS,
  check: async (sheet, ctx) => {
    const { headers, rows } = sheetRows(sheet)
    return { ignored: unknownHeaders(headers, ['title', 'task', 'name', 'project', 'project_code', 'assignee_email', 'assignee', 'owner_email', 'status', 'priority', 'due_date', 'due', 'description']), rows: checkTaskRows(rows, await workLookups(ctx)) }
  },
  commit: async (records, ctx) => {
    const now = new Date()
    const docs = []
    for (const r of records) {
      docs.push({
        key: await nextTaskKey(ctx), title: r.title, description: r.description, status: r.status, priority: r.priority, assigneeIds: r.assigneeId ? [r.assigneeId] : [],
        creatorId: ctx.memberId, projectId: r.projectId, dueDate: r.dueDate, order: 0, completedAt: r.status === 'done' ? now : undefined,
      })
    }
    const inserted = await ctx.db(Task).insertMany(docs)
    return { created: [{ model: 'Task', ids: inserted.map((d) => d._id as Types.ObjectId) }], count: inserted.length }
  },
}
