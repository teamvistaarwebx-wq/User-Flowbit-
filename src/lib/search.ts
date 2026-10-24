import 'server-only'
import mongoose, { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { matchingMemberUsers } from '@/lib/member-search'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { visibleEmployeeIds } from '@/modules/muster/people/scope'
import { projectAccessMatch } from '@/modules/work/projects/access'
import { taskVisibilityFilter } from '@/modules/work/tasks/viewer'

export type SearchHit = { id: string; type: 'client' | 'person' | 'task' | 'project' | 'invoice' | 'lead' | 'deal'; title: string; subtitle?: string; href: string }

const LIMIT = 6

/**
 * Workspace search for the command palette. Core searches Clients and
 * people; tasks, projects, invoices, leads and deals are read straight from
 * their collections ('tasks' title/key, 'projects' name/code, 'invoices'
 * number, 'leads' companyName/contactName, 'deals' title) when the products
 * have created them. Every hit respects the same visibility as its page
 * (tasks: Work 1.2, projects: Work A5.2, people: Muster scope, leads/deals: owner).
 */
export async function searchWorkspace(ctx: Ctx, q: string): Promise<SearchHit[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const re = new RegExp(escapeRegex(term), 'i')
  const [clients, people, tasks, projects, invoices, leads, deals] = await Promise.all([
    ctx.can('clients.read') ? searchClients(ctx, re) : [],
    searchPeople(ctx, re),
    ctx.has('work') && ctx.can('tasks.read') ? searchCollection(ctx, 'tasks', re, ['title', 'key'], (d) => ({ id: String(d._id), type: 'task', title: String(d.title ?? 'Task'), subtitle: d.key ? String(d.key) : undefined, href: `/app/work/tasks/${d._id}` }), await taskScope(ctx)) : [],
    ctx.has('work') && ctx.can('projects.read') ? searchCollection(ctx, 'projects', re, ['name', 'code'], (d) => ({ id: String(d._id), type: 'project', title: String(d.name ?? 'Project'), subtitle: d.code ? String(d.code) : undefined, href: `/app/work/projects/${d._id}` }), projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), toObjectId)) : [],
    ctx.has('folio') && ctx.can('folio.read') ? searchCollection(ctx, 'invoices', re, ['number'], (d) => ({ id: String(d._id), type: 'invoice', title: String(d.number ?? 'Draft invoice'), subtitle: d.status ? String(d.status) : undefined, href: `/app/folio/invoices/${d._id}` })) : [],
    ctx.has('orbit') && ctx.can('orbit.read') ? searchCollection(ctx, 'leads', re, ['companyName', 'contactName'], (d) => ({ id: String(d._id), type: 'lead', title: String(d.companyName ?? 'Lead'), subtitle: d.contactName ? String(d.contactName) : undefined, href: `/app/orbit/leads/${d._id}` }), ownScope(ctx, ['ownerId', 'reviewerId'])) : [],
    ctx.has('orbit') && ctx.can('orbit.read') ? searchCollection(ctx, 'deals', re, ['title'], (d) => ({ id: String(d._id), type: 'deal', title: String(d.title ?? 'Deal'), subtitle: d.stage ? String(d.stage) : undefined, href: `/app/orbit/deals/${d._id}` }), ownScope(ctx, ['ownerId'])) : [],
  ])
  return [...tasks, ...projects, ...clients, ...invoices, ...leads, ...deals, ...people]
}

const toObjectId = (id: string) => new Types.ObjectId(id)

/** Tasks the member can open (never others' personal to-dos). */
const taskScope = (ctx: Ctx) => taskVisibilityFilter(ctx, toObjectId)

/** Without orbit.view_all, Orbit records are limited to the member's own (owner or reviewer). */
function ownScope(ctx: Ctx, fields: string[]): Record<string, unknown> {
  if (ctx.can('orbit.view_all')) return {}
  return { $or: fields.map((f) => ({ [f]: ctx.memberId })) }
}

async function searchClients(ctx: Ctx, re: RegExp): Promise<SearchHit[]> {
  const rows = await ctx.db(Client).find({ $or: [{ name: re }, { displayName: re }, { email: re }, { gstin: re }] }, { name: 1, email: 1, status: 1 }).limit(LIMIT).lean()
  return rows.map((c) => ({ id: String(c._id), type: 'client', title: c.name, subtitle: c.email ?? c.status, href: `/app/clients/${c._id}` }))
}

async function searchPeople(ctx: Ctx, re: RegExp): Promise<SearchHit[]> {
  const users = await matchingMemberUsers(ctx, re, { status: { $ne: 'disabled' } }, LIMIT)
  if (!users.length) return []
  const members = await ctx.db(Member).find({ userId: { $in: users.map((u) => u._id) }, status: { $ne: 'disabled' } }, { userId: 1, title: 1, employeeId: 1 }).limit(LIMIT).lean()
  const byId = new Map(users.map((u) => [String(u._id), u]))
  const canPeople = ctx.has('muster') && ctx.can('people.read')
  // Link to an employee page only when this viewer may open that record (else it is a 404).
  const visible = canPeople ? await visibleEmployeeIds(ctx) : []
  const canOpen = (employeeId: unknown) => Boolean(employeeId) && (visible === null || visible.includes(String(employeeId)))
  return members.map((m) => {
    const u = byId.get(String(m.userId))
    const href = canPeople && canOpen(m.employeeId) ? `/app/hr/people/${m.employeeId}` : ctx.can('members.manage') ? '/app/settings/members' : '/app'
    return { id: String(m._id), type: 'person', title: u?.name ?? 'Member', subtitle: m.title ?? u?.email, href }
  })
}

type RawDoc = Record<string, unknown> & { _id: unknown }

async function searchCollection(ctx: Ctx, name: string, re: RegExp, fields: string[], map: (doc: RawDoc) => SearchHit, scope: Record<string, unknown> = {}): Promise<SearchHit[]> {
  const db = mongoose.connection.db
  if (!db) return []
  try {
    const rows = await db
      .collection(name)
      .find({ $and: [{ orgId: ctx.orgId }, { $or: fields.map((f) => ({ [f]: re })) }, scope] })
      .limit(LIMIT)
      .toArray()
    return rows.map((r) => map(r as RawDoc))
  } catch (error) {
    console.error(`[search] ${name} lookup failed`, error)
    return []
  }
}
