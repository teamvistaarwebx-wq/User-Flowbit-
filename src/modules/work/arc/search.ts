import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { formatDate, formatTime } from '@/lib/dates'
import { matchingMemberUsers } from '@/lib/member-search'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Employee } from '@/models/muster/Employee'
import { Meeting } from '@/models/work/Meeting'
import { Post } from '@/models/work/Post'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { visibleEmployeeIds, visibleFilter } from '@/modules/muster/people/scope'
import { meetingScope } from '../meetings/access'
import { postScope } from '../posts/access'
import { viewerGroups } from '../posts/audience'
import { POST_TYPE_META, postTypeOf } from '../posts/post-types'
import { projectAccessMatch } from '../projects/access'
import { taskVisibilityFilter } from '../tasks/viewer'
import type { MongoFilter } from '../reports/mongo-filter'

const LIMIT = 5
export type HitGroup = 'tasks' | 'projects' | 'clients' | 'people' | 'posts' | 'meetings'
export type SearchItem = { id: string; title: string; subtitle?: string; href: string; status?: string }
export type SearchGroups = Partial<Record<HitGroup, SearchItem[]>>

const toObjectId = (id: string) => new Types.ObjectId(id)

/** Tasks the member may see (Work spec 1.2, the same rule as the task pages): visible non-personal tasks plus own/shared personal ones. */
export const taskVisibility = (ctx: Ctx): Promise<MongoFilter> => taskVisibilityFilter(ctx)

/** Projects the member can open (Work spec A5.2). */
export const projectVisibility = (ctx: Ctx): MongoFilter => projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), toObjectId)

/** Exact match first, then each longer word, so "website homepage" finds either. */
function matcher(q: string, fields: string[]): MongoFilter {
  const words = q.split(/\s+/).filter((w) => w.length > 2)
  const patterns = [q, ...(words.length > 1 ? words : [])].map((w) => new RegExp(escapeRegex(w), 'i'))
  const active = q.length <= 2 ? fields.slice(0, 1) : fields
  return { $or: active.flatMap((f) => patterns.map((re) => ({ [f]: re }))) }
}

/** Direct hit for a task key like VW-42. */
export async function taskByKey(ctx: Ctx, q: string): Promise<string | null> {
  if (!/^[a-z]{1,6}-\d{1,7}$/i.test(q.trim())) return null
  const task = await ctx.db(Task).findOne({ key: q.trim().toUpperCase(), ...(await taskVisibility(ctx)) }, { _id: 1 }).lean()
  return task ? String(task._id) : null
}

export async function workspaceSearch(ctx: Ctx, rawQ: string): Promise<SearchGroups> {
  const q = rawQ.trim().slice(0, 120)
  if (!q) return {}
  const visibility = await taskVisibility(ctx)
  const canClients = ctx.can('clients.read') && (['work', 'orbit', 'folio'] as const).some(ctx.has)
  const canEmployees = ctx.has('muster') && ctx.can('people.read')
  const [tasks, projects, clients, people, employees, posts, meetings] = await Promise.all([
    ctx.db(Task).find({ $and: [visibility, matcher(q, ['title', 'key', 'description', 'tags'])] }, { title: 1, key: 1, status: 1, dueDate: 1 }).sort({ updatedAt: -1 }).limit(LIMIT).lean(),
    ctx.can('projects.read') ? ctx.db(Project).find({ $and: [projectVisibility(ctx), matcher(q, ['name', 'code', 'description'])] }, { name: 1, code: 1, status: 1, health: 1 }).limit(LIMIT).lean() : [],
    canClients ? ctx.db(Client).find(matcher(q, ['name', 'displayName', 'email']), { name: 1, email: 1, status: 1 }).limit(LIMIT).lean() : [],
    searchPeople(ctx, q),
    canEmployees ? ctx.db(Employee).find({ $and: [visibleFilter(await visibleEmployeeIds(ctx)), matcher(q, ['firstName', 'lastName', 'workEmail', 'code', 'designation'])] }, { firstName: 1, lastName: 1, designation: 1, code: 1 }).limit(LIMIT).lean() : [],
    ctx.db(Post).find({ $and: [{ deletedAt: null }, postScope(ctx, await viewerGroups(ctx)), matcher(q, ['title', 'message'])] }, { title: 1, category: 1 }).sort({ createdAt: -1 }).limit(LIMIT).lean(),
    ctx.db(Meeting).find({ $and: [meetingScope(ctx), matcher(q, ['title', 'agenda'])] }, { title: 1, startAt: 1, status: 1 }).sort({ startAt: -1 }).limit(LIMIT).lean(),
  ])
  return {
    tasks: tasks.map((t) => ({ id: String(t._id), title: t.title, subtitle: [t.key, t.dueDate ? `due ${formatDate(t.dueDate)}` : undefined].filter(Boolean).join(' · '), href: `/app/work/tasks/${t._id}`, status: t.status })),
    projects: projects.map((p) => ({ id: String(p._id), title: p.name, subtitle: p.code, href: `/app/work/projects/${p._id}`, status: p.health ?? p.status })),
    clients: clients.map((c) => ({ id: String(c._id), title: c.name, subtitle: c.email ?? undefined, href: `/app/clients/${c._id}`, status: c.status })),
    people: [
      ...people,
      ...employees.filter((e) => !people.some((p) => p.title === `${e.firstName} ${e.lastName}`.trim())).map((e) => ({ id: String(e._id), title: `${e.firstName} ${e.lastName ?? ''}`.trim(), subtitle: [e.code, e.designation].filter(Boolean).join(' · '), href: `/app/hr/people/${e._id}` })),
    ].slice(0, LIMIT),
    posts: posts.map((p) => ({ id: String(p._id), title: p.title, subtitle: POST_TYPE_META[postTypeOf(p.category)].label, href: `/app/work/posts/${p._id}` })),
    meetings: meetings.map((m) => ({ id: String(m._id), title: m.title, subtitle: `${formatDate(m.startAt, { short: true })}, ${formatTime(m.startAt)}`, href: `/app/work/meetings/${m._id}`, status: m.status === 'cancelled' ? 'cancelled' : undefined })),
  }
}

async function searchPeople(ctx: Ctx, q: string): Promise<SearchItem[]> {
  const re = new RegExp(escapeRegex(q), 'i')
  const [byTitle, users] = await Promise.all([
    ctx.db(Member).find({ status: 'active', $or: [{ title: re }, { department: re }] }, { userId: 1, title: 1, department: 1, employeeId: 1 }).limit(LIMIT).lean(),
    matchingMemberUsers(ctx, re, { status: 'active' }, LIMIT),
  ])
  const byUser = await ctx.db(Member).find({ status: 'active', userId: { $in: users.map((u) => u._id) } }, { userId: 1, title: 1, department: 1, employeeId: 1 }).limit(LIMIT).lean()
  const members = [...byUser, ...byTitle.filter((m) => !byUser.some((b) => String(b._id) === String(m._id)))].slice(0, LIMIT)
  const names = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1 }).lean()
  const canPeople = ctx.has('muster') && ctx.can('people.read')
  // Employee pages only for records this viewer may open; otherwise their tasks.
  const visible = canPeople ? await visibleEmployeeIds(ctx) : []
  const canOpen = (id: unknown) => Boolean(id) && (visible === null || visible.includes(String(id)))
  return members.map((m) => {
    const u = names.find((x) => String(x._id) === String(m.userId))
    return {
      id: String(m._id),
      title: u?.name ?? 'Member',
      subtitle: [m.title, m.department].filter(Boolean).join(' · ') || u?.email,
      href: canPeople && canOpen(m.employeeId) ? `/app/hr/people/${m.employeeId}` : `/app/work/tasks?assignee=${m._id}`,
    }
  })
}
