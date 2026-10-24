import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { appUrl } from '@/lib/env'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { User } from '@/models/User'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { dealAccess, leadAccess } from '@/modules/orbit/scope'
import { projectAccessMatch } from '@/modules/work/projects/access'
import { taskVisibilityFilter } from '@/modules/work/tasks/viewer'
import { phoneDigits, prefilterStems, queryIsEmail, queryIsPhone, type Candidate, type RecordKind } from '../find/match'

/**
 * Records an MCP call may match, read with the person's own visibility
 * (tasks they can see, their own leads unless orbit.view_all, projects they
 * belong to unless projects.write). A cheap regex pre-filter keeps each
 * query small; the pure matcher (find/match) does the scoring.
 */

const PER_KIND = 200

export const recordLink = (kind: RecordKind | 'invoice' | 'quote', id: string): string => {
  const path: Record<string, string> = {
    member: `/app/work/teams?member=${id}`,
    client: `/app/clients/${id}`,
    project: `/app/work/projects/${id}`,
    task: `/app/work/tasks/${id}`,
    lead: `/app/orbit/leads/${id}`,
    deal: `/app/orbit/deals/${id}`,
    invoice: `/app/folio/invoices/${id}`,
    quote: `/app/folio/quotes/${id}`,
  }
  return appUrl(path[kind])
}

/** $or of case-insensitive stem regexes over `fields`, or {} when the query has no stems. */
function textFilter(query: string, fields: readonly string[]): Record<string, unknown> {
  const stems = prefilterStems(query)
  if (queryIsEmail(query)) return { $or: fields.map((f) => ({ [f]: new RegExp(`^${escapeRegex(query.trim())}$`, 'i') })) }
  if (queryIsPhone(query)) {
    const tail = phoneDigits(query).slice(-7)
    return { $or: fields.map((f) => ({ [f]: new RegExp(tail.split('').join('\\D*')) })) }
  }
  if (!stems.length) return {}
  return { $or: fields.flatMap((f) => stems.map((s) => ({ [f]: new RegExp(escapeRegex(s), 'i') }))) }
}

export const isObjectId = (id: string) => /^[a-f0-9]{24}$/i.test(id)

async function members(ctx: Ctx, query: string | null, id?: string): Promise<Candidate[]> {
  const rows = await ctx.db(Member).find({ status: 'active', ...(id ? { _id: id } : {}) }, { userId: 1, title: 1 }).lean()
  const userFilter: Record<string, unknown> = { _id: { $in: rows.map((m) => m.userId) } }
  const text = query ? textFilter(query, ['name', 'email', 'phone']) : {}
  const users = await User.find({ ...userFilter, ...text }, { name: 1, email: 1, phone: 1 }).limit(PER_KIND).lean()
  const byUser = new Map(users.map((u) => [String(u._id), u]))
  return rows.flatMap((m) => {
    const u = byUser.get(String(m.userId))
    return u ? [{ kind: 'member' as const, id: String(m._id), name: u.name, aliases: [u.email, u.phone ?? ''].filter(Boolean), detail: m.title ?? undefined, link: recordLink('member', String(m._id)) }] : []
  })
}

async function clients(ctx: Ctx, query: string | null, id?: string): Promise<Candidate[]> {
  if (!ctx.can('clients.read') && !ctx.can('folio.read') && !ctx.can('orbit.read') && !ctx.can('tasks.read')) return []
  const text = query ? textFilter(query, ['name', 'displayName', 'email', 'phone', 'contacts.email', 'contacts.name']) : {}
  const rows = await ctx.db(Client).find({ ...(id ? { _id: id } : {}), status: { $ne: 'archived' }, ...text }, { name: 1, displayName: 1, email: 1, phone: 1, contacts: 1 }).limit(PER_KIND).lean()
  return rows.map((c) => ({
    kind: 'client' as const,
    id: String(c._id),
    name: c.displayName || c.name,
    aliases: [c.name, c.email ?? '', c.phone ?? '', ...(c.contacts ?? []).flatMap((p) => [p.email ?? '', p.name])].filter(Boolean),
    link: recordLink('client', String(c._id)),
  }))
}

async function projects(ctx: Ctx, query: string | null, id?: string): Promise<Candidate[]> {
  if (!ctx.has('work') || !ctx.can('projects.read')) return []
  const text = query ? textFilter(query, ['name', 'code']) : {}
  const access = projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), (x) => new Types.ObjectId(x))
  const rows = await ctx.db(Project).find({ $and: [access, text, id ? { _id: id } : {}], archivedAt: null }, { name: 1, code: 1, status: 1 }).limit(PER_KIND).lean()
  return rows.map((p) => ({ kind: 'project' as const, id: String(p._id), name: p.name, aliases: [p.code], detail: p.status, link: recordLink('project', String(p._id)) }))
}

async function tasks(ctx: Ctx, query: string | null, id?: string, openOnly = false): Promise<Candidate[]> {
  if (!ctx.has('work') || !ctx.can('tasks.read')) return []
  const key = query && /^[A-Z][A-Z0-9]{0,9}-\d{1,7}$/i.test(query.trim()) ? { key: query.trim().toUpperCase() } : null
  const text = key ?? (query ? textFilter(query, ['title', 'key']) : {})
  const visible = await taskVisibilityFilter(ctx)
  const rows = await ctx.db(Task).find({ $and: [visible, text, id ? { _id: id } : {}, openOnly ? { status: { $ne: 'done' } } : {}] }, { title: 1, key: 1, status: 1, dueDate: 1 }).sort({ updatedAt: -1 }).limit(PER_KIND).lean()
  return rows.map((t) => ({ kind: 'task' as const, id: String(t._id), name: t.title, aliases: [t.key], detail: `${t.key} · ${t.status}${t.dueDate ? ` · due ${t.dueDate}` : ''}`, link: recordLink('task', String(t._id)) }))
}

async function leads(ctx: Ctx, query: string | null, id?: string): Promise<Candidate[]> {
  if (!ctx.has('orbit') || !ctx.can('orbit.read')) return []
  const text = query ? textFilter(query, ['companyName', 'contactName', 'email', 'phone']) : {}
  const rows = await ctx.db(Lead).find({ $and: [leadAccess(ctx), text, id ? { _id: id } : {}] }, { companyName: 1, contactName: 1, email: 1, phone: 1, stage: 1 }).sort({ updatedAt: -1 }).limit(PER_KIND).lean()
  return rows.map((l) => ({ kind: 'lead' as const, id: String(l._id), name: l.companyName, aliases: [l.contactName, l.email, l.phone].filter(Boolean), detail: l.stage, link: recordLink('lead', String(l._id)) }))
}

async function deals(ctx: Ctx, query: string | null, id?: string): Promise<Candidate[]> {
  if (!ctx.has('orbit') || !ctx.can('orbit.read')) return []
  const text = query ? textFilter(query, ['title']) : {}
  const rows = await ctx.db(Deal).find({ $and: [dealAccess(ctx), text, id ? { _id: id } : {}] }, { title: 1, stage: 1, status: 1, clientId: 1 }).sort({ updatedAt: -1 }).limit(PER_KIND).lean()
  const clientNames = new Map((await ctx.db(Client).find({ _id: { $in: rows.map((d) => d.clientId).filter(Boolean) } }, { name: 1 }).lean()).map((c) => [String(c._id), c.name]))
  return rows.map((d) => ({ kind: 'deal' as const, id: String(d._id), name: d.title, aliases: [clientNames.get(String(d.clientId)) ?? ''].filter(Boolean), detail: `${d.status} · ${d.stage}`, link: recordLink('deal', String(d._id)) }))
}

const LOADERS: Readonly<Record<RecordKind, (ctx: Ctx, query: string | null, id?: string) => Promise<Candidate[]>>> = { member: members, client: clients, project: projects, task: tasks, lead: leads, deal: deals }

/** Candidates of one kind for a free-text query. */
export const candidatesFor = (ctx: Ctx, kind: RecordKind, query: string) => LOADERS[kind](ctx, query)

/** One record by id, if this person may see it. */
export async function candidateById(ctx: Ctx, kind: RecordKind, id: string): Promise<Candidate | null> {
  if (!isObjectId(id)) return null
  const [found] = await LOADERS[kind](ctx, null, id)
  return found ?? null
}

/** Open tasks this person can see, for duplicate checks. */
export const openTaskCandidates = (ctx: Ctx, title: string) => tasks(ctx, title, undefined, true)
