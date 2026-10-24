/**
 * Work demo data (work-a): spaces with lists, projects with milestones, ~50
 * tasks with subtasks, checklists, comments and activity, personal to-dos and
 * saved views. Then runs work-b's seed (./seed-b) when it exists.
 * Models and pure helpers only (no server-only modules).
 */
import { Types } from 'mongoose'
import type { SeedCtx, SeedMember } from '@/lib/seed-types'
import { addDays, istInstant, todayIST } from '@/lib/dates'
import { formatSeq, nextSeq, prefixFrom } from '@/lib/sequence'
import { Client } from '@/models/Client'
import { User } from '@/models/User'
import { Folder } from '@/models/work/Folder'
import { Milestone } from '@/models/work/Milestone'
import { Project } from '@/models/work/Project'
import { SavedView } from '@/models/work/SavedView'
import { Space } from '@/models/work/Space'
import { Task } from '@/models/work/Task'
import { TaskActivity } from '@/models/work/TaskActivity'
import { TaskComment } from '@/models/work/TaskComment'
import { completion, projectHealth, type ProjectCounts } from './projects/health'
import type { ActivityType } from './tasks/activity'
import { SEED_PROJECTS, SEED_SPACES } from './projects/seed-data'
import { SEED_COMMENTS, SEED_PERSONAL, SEED_TASKS, type SeedTask } from './tasks/seed-data'

type Id = Types.ObjectId
type SpaceRef = { id: Id; folders: Map<string, Id> }
type ProjectRef = { id: Id; clientId?: Id; leadId: Id; milestones: Map<string, Id> }
type Activity = { taskId?: Id; projectId?: Id; actorId: Id; type: ActivityType; from?: unknown; to?: unknown; meta?: Record<string, unknown>; createdAt: Date }

/** Role key ('manager') or a demo person's title ('QA Engineer') -> member. */
function people(ctx: SeedCtx): (ref: string) => SeedMember {
  return (ref) => (ref in ctx.members ? ctx.members[ref as keyof SeedCtx['members']] : ctx.allMembers.find((m) => m.title === ref)) ?? ctx.members.member
}

async function seedSpaces(ctx: SeedCtx, who: (ref: string) => SeedMember): Promise<Map<string, SpaceRef>> {
  const out = new Map<string, SpaceRef>()
  for (const [i, s] of SEED_SPACES.entries()) {
    const creator = who(s.creator)._id
    const members = [creator, ...s.members.map((m) => who(m)._id)].map((memberId) => ({ memberId, addedById: creator }))
    const space = await ctx.db(Space).create({ name: s.name, description: s.description, color: s.color, icon: s.icon, order: i + 1, createdById: creator, members })
    const folders = await ctx.db(Folder).insertMany(s.folders.map((name, order) => ({ spaceId: space._id, name, order: order + 1, createdById: creator, color: ['#7E768C', '#60A5FA', '#5EEAB0'][order % 3] })))
    out.set(s.name, { id: space._id, folders: new Map(folders.map((f) => [f.name, f._id])) })
  }
  return out
}

async function seedProjects(ctx: SeedCtx, who: (ref: string) => SeedMember, today: string): Promise<Map<string, ProjectRef>> {
  const clients = await ctx.db(Client).find({}, { name: 1 }).lean()
  const out = new Map<string, ProjectRef>()
  for (const p of SEED_PROJECTS) {
    const lead = who(p.lead)._id
    const clientId = clients.find((c) => c.name === p.client)?._id
    const project = await ctx.db(Project).create({
      code: p.code, name: p.name, description: p.description, clientId, status: p.status, leadId: lead, createdById: ctx.members.owner._id,
      memberIds: [...new Set([lead, ...p.members.map((m) => who(m)._id)].map(String))],
      startDate: p.start != null ? addDays(today, p.start) : undefined, endDate: p.end != null ? addDays(today, p.end) : undefined,
      color: p.color, tags: p.tags, archivedAt: p.archived ? istInstant(addDays(today, -45), '18:00') : null,
      createdAt: istInstant(addDays(today, (p.start ?? -20) - 3), '11:00'),
    })
    const milestones = await ctx.db(Milestone).insertMany(
      p.milestones.map((m, order) => ({ projectId: project._id, title: m.title, dueDate: addDays(today, m.due), status: m.done ? 'done' : 'open', doneAt: m.done ? istInstant(addDays(today, m.due), '17:00') : undefined, order })),
    )
    out.set(p.key, { id: project._id, clientId: clientId ?? undefined, leadId: lead, milestones: new Map(milestones.map((m) => [m.title, m._id])) })
  }
  return out
}

/** Task document + its timeline rows, backdated so sparklines and reports have history. */
function buildTask(t: SeedTask, ctx: { key: string; today: string; who: (ref: string) => SeedMember; project?: ProjectRef; space?: SpaceRef; order: number }) {
  const at = (daysAgo: number, time = '11:30') => istInstant(addDays(ctx.today, -daysAgo), time)
  const assignees = t.who.map((w) => ctx.who(w)._id)
  const creator = ctx.project?.leadId ?? assignees[0]
  const createdAgo = Math.max(t.startedAgo ?? 0, t.doneAgo ?? 0) + 2
  const _id = new Types.ObjectId()
  const startedAt = t.startedAgo != null && t.status !== 'todo' ? at(t.startedAgo, '10:30') : undefined
  const completedAt = t.status === 'done' ? at(t.doneAgo ?? 0, '17:15') : undefined
  const doc = {
    _id, key: ctx.key, title: t.title, description: t.description, status: t.status, priority: t.priority, assigneeIds: assignees, creatorId: creator,
    projectId: ctx.project?.id, clientId: ctx.project?.clientId, milestoneId: t.milestone ? ctx.project?.milestones.get(t.milestone) : undefined,
    spaceId: ctx.space?.id, folderId: t.where ? ctx.space?.folders.get(t.where[1]) : undefined, parentId: null as Id | null,
    dueDate: t.due != null ? addDays(ctx.today, t.due) : undefined, startDate: t.start != null ? addDays(ctx.today, t.start) : undefined,
    startedAt, completedAt, isPersonal: false, watcherIds: [...new Set([creator, ...assignees].map(String))], tags: t.tags ?? [],
    estimateMinutes: t.estimate, order: ctx.order, blockedReason: t.blocked, blockedAt: t.blocked ? at(1, '15:00') : undefined, blockedById: t.blocked ? assignees[0] : undefined,
    checklist: (t.checklist ?? []).map(([title, done]) => ({ title, done, doneAt: done ? at(1) : undefined, doneById: done ? assignees[0] : undefined })),
    createdAt: at(createdAgo, '10:00'),
  }
  const acts: Activity[] = [{ taskId: _id, projectId: ctx.project?.id, actorId: creator, type: 'created', createdAt: doc.createdAt }]
  if (startedAt) acts.push({ taskId: _id, projectId: ctx.project?.id, actorId: assignees[0], type: 'status_changed', from: 'todo', to: 'in_progress', createdAt: startedAt })
  if (t.status === 'in_review') acts.push({ taskId: _id, projectId: ctx.project?.id, actorId: assignees[0], type: 'status_changed', from: 'in_progress', to: 'in_review', createdAt: at(Math.max(0, (t.startedAgo ?? 1) - 1), '16:00') })
  if (t.blocked) acts.push({ taskId: _id, projectId: ctx.project?.id, actorId: assignees[0], type: 'blocked', to: t.blocked, createdAt: at(1, '15:00') })
  if (completedAt) acts.push({ taskId: _id, projectId: ctx.project?.id, actorId: assignees[0], type: 'status_changed', from: 'in_progress', to: 'done', createdAt: completedAt })
  return { doc, acts }
}

async function seedTasks(ctx: SeedCtx, who: (ref: string) => SeedMember, today: string, spaces: Map<string, SpaceRef>, projects: Map<string, ProjectRef>) {
  const prefix = `${prefixFrom(ctx.org.name) || 'FB'}-`
  const key = async () => formatSeq(await nextSeq(ctx.orgId, 'task'), { prefix })
  const docs: ReturnType<typeof buildTask>['doc'][] = []
  const acts: Activity[] = []
  const byTitle = new Map<string, { _id: Id; projectId?: Id }>()
  for (const [i, t] of SEED_TASKS.entries()) {
    const project = t.project ? projects.get(t.project) : undefined
    const space = t.where ? spaces.get(t.where[0]) : undefined
    const built = buildTask(t, { key: await key(), today, who, project, space, order: i })
    docs.push(built.doc)
    acts.push(...built.acts)
    byTitle.set(t.title, { _id: built.doc._id, projectId: project?.id })
    for (const [j, s] of (t.subtasks ?? []).entries()) {
      const child = buildTask({ title: s.title, status: s.status, priority: t.priority, who: [s.who], due: t.due, project: t.project, where: t.where, startedAgo: s.status === 'todo' ? undefined : 3, doneAgo: s.status === 'done' ? 2 : undefined }, { key: await key(), today, who, project, space, order: 1000 + j })
      docs.push({ ...child.doc, parentId: built.doc._id, milestoneId: undefined })
      acts.push(...child.acts, { taskId: built.doc._id, projectId: project?.id, actorId: built.doc.creatorId, type: 'subtask_added', meta: { title: s.title }, createdAt: child.doc.createdAt })
    }
  }
  await ctx.db(Task).insertMany(docs)
  return { byTitle, acts, count: docs.length }
}

async function seedPersonal(ctx: SeedCtx, who: (ref: string) => SeedMember, today: string): Promise<number> {
  const prefix = `${prefixFrom(ctx.org.name) || 'FB'}-`
  const docs = []
  for (const [i, p] of SEED_PERSONAL.entries()) {
    const me = who(p.who)._id
    docs.push({
      key: formatSeq(await nextSeq(ctx.orgId, 'task'), { prefix }), title: p.title, status: p.status, priority: 'medium' as const, assigneeIds: [me], creatorId: me, isPersonal: true,
      watcherIds: [me], dueDate: p.due != null ? addDays(today, p.due) : undefined, order: 2000 + i,
      startedAt: p.status === 'in_progress' ? istInstant(addDays(today, -2), '09:00') : undefined,
      completedAt: p.status === 'done' ? istInstant(addDays(today, -(p.doneAgo ?? 0)), '20:00') : undefined,
    })
  }
  await ctx.db(Task).insertMany(docs)
  return docs.length
}

async function seedComments(ctx: SeedCtx, who: (ref: string) => SeedMember, tasks: Map<string, { _id: Id; projectId?: Id }>, today: string): Promise<Activity[]> {
  const users = await User.find({ _id: { $in: ctx.allMembers.map((m) => m.userId) } }, { name: 1 }).lean()
  const nameOf = (m: SeedMember) => users.find((u) => String(u._id) === String(m.userId))?.name ?? 'teammate'
  const render = (body: string) => {
    const refs = [...body.matchAll(/@\{([^}]+)\}/g)].map((x) => x[1])
    return { text: body.replace(/@\{([^}]+)\}/g, (_, ref: string) => `@${nameOf(who(ref))}`), mentionIds: refs.map((r) => who(r)._id) }
  }
  const acts: Activity[] = []
  for (const [i, c] of SEED_COMMENTS.entries()) {
    const task = tasks.get(c.task)
    if (!task) continue
    const at = istInstant(addDays(today, -1 - (i % 3)), `1${i % 8}:20`)
    const { text, mentionIds } = render(c.body)
    const comment = await ctx.db(TaskComment).create({ taskId: task._id, authorId: who(c.by)._id, body: text, mentionIds, reactions: [{ emoji: '👍', memberId: ctx.members.owner._id }], createdAt: at })
    acts.push({ taskId: task._id, projectId: task.projectId, actorId: who(c.by)._id, type: 'comment_added', meta: { commentId: String(comment._id) }, createdAt: at })
    if (c.reply) {
      const later = new Date(at.getTime() + 45 * 60_000)
      await ctx.db(TaskComment).create({ taskId: task._id, authorId: who(c.reply.by)._id, body: c.reply.body, parentId: comment._id, createdAt: later })
      acts.push({ taskId: task._id, projectId: task.projectId, actorId: who(c.reply.by)._id, type: 'comment_added', createdAt: later })
    }
  }
  return acts
}

/** Persist health, score and progress from the seeded tasks (same rules as the app). */
async function seedHealth(ctx: SeedCtx, projects: Map<string, ProjectRef>, today: string): Promise<void> {
  for (const ref of projects.values()) {
    const tasks = await ctx.db(Task).find({ projectId: ref.id, parentId: null, isPersonal: { $ne: true } }, { status: 1, dueDate: 1 }).lean()
    const counts: ProjectCounts = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'done').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress' || t.status === 'in_review').length,
      blocked: tasks.filter((t) => t.status === 'blocked').length,
      overdue: tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today).length,
    }
    const project = await ctx.db(Project).findById(ref.id, { startDate: 1, endDate: 1 }).lean()
    const { score, health } = projectHealth(counts, project ?? {}, today)
    await ctx.db(Project).updateOne({ _id: ref.id }, { $set: { health, healthScore: score, progress: completion(counts) } })
  }
}

async function seedViews(ctx: SeedCtx): Promise<void> {
  await ctx.db(SavedView).insertMany([
    { name: 'My overdue', ownerId: ctx.members.owner._id, query: 'view=list&mine=1&due=overdue', view: 'list', shared: false, order: 0 },
    { name: 'Blocked across projects', ownerId: ctx.members.manager._id, query: 'view=list&status=blocked', view: 'list', shared: true, order: 0 },
    { name: 'Urgent this week', ownerId: ctx.members.manager._id, query: 'view=board&priority=urgent,high&due=week', view: 'board', shared: true, order: 1 },
  ])
}

async function runWorkB(ctx: SeedCtx): Promise<void> {
  const specifier = './seed-b'
  let mod: { seed?: (c: SeedCtx) => Promise<void> }
  try {
    mod = await import(specifier)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      ctx.log('work-b: no seed-b.ts yet, skipped')
      return
    }
    throw error
  }
  if (typeof mod.seed === 'function') await mod.seed(ctx)
}

export async function seed(ctx: SeedCtx): Promise<void> {
  const today = todayIST()
  const who = people(ctx)
  const spaces = await seedSpaces(ctx, who)
  const projects = await seedProjects(ctx, who, today)
  ctx.log(`spaces: ${spaces.size}, projects: ${projects.size}`)
  const { byTitle, acts, count } = await seedTasks(ctx, who, today, spaces, projects)
  const personal = await seedPersonal(ctx, who, today)
  const commentActs = await seedComments(ctx, who, byTitle, today)
  const projectActs: Activity[] = [...projects.values()].map((p) => ({ projectId: p.id, actorId: ctx.members.owner._id, type: 'project_created', createdAt: istInstant(addDays(today, -30), '10:00') }))
  await ctx.db(TaskActivity).insertMany([...acts, ...commentActs, ...projectActs])
  await seedHealth(ctx, projects, today)
  await seedViews(ctx)
  ctx.log(`tasks: ${count} (+${personal} personal), comments: ${SEED_COMMENTS.length}, activity: ${acts.length + commentActs.length + projectActs.length}`)
  await runWorkB(ctx)
}
