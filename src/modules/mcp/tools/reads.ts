import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { addDays, todayIST } from '@/lib/dates'
import { appUrl } from '@/lib/env'
import { NotFoundError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Invoice } from '@/models/folio/Invoice'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Member } from '@/models/Member'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { User } from '@/models/User'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TaskComment } from '@/models/work/TaskComment'
import { Team } from '@/models/work/Team'
import { buildBrief } from '@/modules/briefs/build'
import { summariseAging, collectionPriority } from '@/modules/folio/engine/aging'
import { listOutstanding } from '@/modules/folio/queries/balances'
import { clientStatement } from '@/modules/folio/queries/ledger'
import { leadAccess, dealAccess } from '@/modules/orbit/scope'
import { getOrbitSettings } from '@/modules/orbit/settings'
import { projectAccessMatch } from '@/modules/work/projects/access'
import { requireTask } from '@/modules/work/tasks/load'
import { getViewer, taskVisibilityFilter } from '@/modules/work/tasks/viewer'
import { recordLink } from '../data/candidates'

/**
 * Read tools: compact rows with links, read with the person's own visibility.
 * Projections name every field returned, so salary, PAN and bank details are
 * never even loaded (never.ts redact() is the second fence).
 */

const LIMIT = 50
const oid = (id: string) => new Types.ObjectId(id)
const rupees = (paise: number | null | undefined) => (paise == null ? null : Math.round(paise) / 100)

async function memberNames(ctx: Ctx, ids: readonly unknown[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return new Map()
  const members = await ctx.db(Member).find({ _id: { $in: unique } }, { userId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  const byUser = new Map(users.map((u) => [String(u._id), u.name]))
  return new Map(members.map((m) => [String(m._id), byUser.get(String(m.userId)) ?? 'Member']))
}

async function clientNames(ctx: Ctx, ids: readonly unknown[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return new Map()
  const rows = await ctx.db(Client).find({ _id: { $in: unique } }, { name: 1, displayName: 1 }).lean()
  return new Map(rows.map((c) => [String(c._id), c.displayName || c.name]))
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

export type TaskFilters = Readonly<{ assignee?: string; projectId?: string; clientId?: string; status?: string; dueFrom?: string; dueTo?: string; priority?: string; overdue?: boolean; mine?: boolean; limit?: number }>

export async function listTasks(ctx: Ctx, f: TaskFilters) {
  const today = todayIST()
  const and: Record<string, unknown>[] = [await taskVisibilityFilter(ctx), { parentId: null }]
  if (f.mine) and.push({ assigneeIds: ctx.memberId })
  if (f.assignee) and.push({ assigneeIds: oid(f.assignee) })
  if (f.projectId) and.push({ projectId: oid(f.projectId) })
  if (f.clientId) and.push({ clientId: oid(f.clientId) })
  if (f.status) and.push({ status: f.status })
  else and.push({ status: { $ne: 'done' } })
  if (f.priority) and.push({ priority: f.priority })
  if (f.overdue) and.push({ dueDate: { $lt: today }, status: { $ne: 'done' } })
  if (f.dueFrom || f.dueTo) and.push({ dueDate: { ...(f.dueFrom ? { $gte: f.dueFrom } : {}), ...(f.dueTo ? { $lte: f.dueTo } : {}) } })
  const rows = await ctx.db(Task).find({ $and: and }, { key: 1, title: 1, status: 1, priority: 1, dueDate: 1, assigneeIds: 1, projectId: 1, clientId: 1, blockedReason: 1 }).sort({ dueDate: 1, updatedAt: -1 }).limit(Math.min(f.limit ?? LIMIT, 100)).lean()
  const [people, clients, projects] = await Promise.all([
    memberNames(ctx, rows.flatMap((t) => t.assigneeIds ?? [])),
    clientNames(ctx, rows.map((t) => t.clientId)),
    ctx.db(Project).find({ _id: { $in: rows.map((t) => t.projectId).filter(Boolean) } }, { name: 1 }).lean(),
  ])
  const projectName = new Map(projects.map((p) => [String(p._id), p.name]))
  return {
    count: rows.length,
    tasks: rows.map((t) => ({
      id: String(t._id), key: t.key, title: t.title, status: t.status, priority: t.priority, due: t.dueDate ?? null, overdue: Boolean(t.dueDate && t.dueDate < today && t.status !== 'done'),
      assignees: (t.assigneeIds ?? []).map((a) => people.get(String(a)) ?? 'Member'), project: t.projectId ? (projectName.get(String(t.projectId)) ?? null) : null,
      client: t.clientId ? (clients.get(String(t.clientId)) ?? null) : null, blocked_reason: t.blockedReason ?? null, link: recordLink('task', String(t._id)),
    })),
  }
}

export async function getTask(ctx: Ctx, id: string) {
  const viewer = await getViewer(ctx)
  const task = await requireTask(ctx, viewer, id)
  const [subtasks, comments, people, clients, project] = await Promise.all([
    ctx.db(Task).find({ parentId: task._id }, { key: 1, title: 1, status: 1 }).sort({ createdAt: 1 }).lean(),
    ctx.db(TaskComment).find({ taskId: task._id }, { body: 1, authorId: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(20).lean(),
    memberNames(ctx, [...(task.assigneeIds ?? []), task.creatorId]),
    clientNames(ctx, [task.clientId]),
    task.projectId ? ctx.db(Project).findById(task.projectId, { name: 1 }).lean() : null,
  ])
  const authors = await memberNames(ctx, comments.map((c) => c.authorId))
  return {
    id: String(task._id), key: task.key, title: task.title, description: task.description ?? '', status: task.status, priority: task.priority, due: task.dueDate ?? null, due_time: task.dueTime ?? null,
    assignees: (task.assigneeIds ?? []).map((a) => people.get(String(a)) ?? 'Member'), created_by: people.get(String(task.creatorId)) ?? 'Member',
    project: project?.name ?? null, client: task.clientId ? (clients.get(String(task.clientId)) ?? null) : null, labels: task.tags ?? [],
    blocked: task.status === 'blocked' ? { reason: task.blockedReason ?? '' } : null, logged_minutes: task.loggedMinutes ?? 0, estimate_minutes: task.estimateMinutes ?? null,
    source: task.origin?.label ?? null,
    checklist: (task.checklist ?? []).map((c) => ({ title: c.title, done: Boolean(c.done) })),
    subtasks: subtasks.map((s) => ({ id: String(s._id), key: s.key, title: s.title, status: s.status, link: recordLink('task', String(s._id)) })),
    last_comments: comments.reverse().map((c) => ({ by: authors.get(String(c.authorId)) ?? 'Member', at: c.createdAt.toISOString(), body: c.body.slice(0, 2000) })),
    link: recordLink('task', String(task._id)),
  }
}

export async function listProjects(ctx: Ctx, status?: string) {
  const access = projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), oid)
  const rows = await ctx.db(Project).find({ $and: [access, { archivedAt: null }, status ? { status } : {}] }, { name: 1, code: 1, status: 1, health: 1, progress: 1, leadId: 1, clientId: 1, endDate: 1 }).sort({ updatedAt: -1 }).limit(LIMIT).lean()
  const [people, clients] = await Promise.all([memberNames(ctx, rows.map((p) => p.leadId)), clientNames(ctx, rows.map((p) => p.clientId))])
  return {
    count: rows.length,
    projects: rows.map((p) => ({ id: String(p._id), code: p.code, name: p.name, status: p.status, health: p.health, progress: p.progress ?? 0, lead: people.get(String(p.leadId)) ?? null, client: p.clientId ? (clients.get(String(p.clientId)) ?? null) : null, end_date: p.endDate ?? null, link: recordLink('project', String(p._id)) })),
  }
}

/** My day: the same sections as the brief (due today, overdue, today's meetings, blocked). */
export async function myDay(ctx: Ctx, opts: { followups: boolean }) {
  const today = todayIST()
  const keys = ['work.due_today', 'work.overdue', 'work.meetings', 'work.blocked', ...(opts.followups ? ['sales.followups'] : [])] as Parameters<typeof buildBrief>[1]
  const sections = await buildBrief(ctx, keys, { projectIds: [], priorities: [], tags: [], scope: 'assigned' }, today)
  return { date: today, sections: sections.map((s) => ({ title: s.title, summary: s.summary ?? null, items: s.lines.map((l) => ({ text: l.text, note: l.meta ?? null, link: l.href ? appUrl(l.href) : null })) })) }
}

// ---------------------------------------------------------------------------
// Orbit
// ---------------------------------------------------------------------------

export type LeadFilters = Readonly<{ stage?: string; ownerId?: string; source?: string; followupDue?: 'overdue' | 'today' | 'week'; query?: string; limit?: number }>

export async function listLeads(ctx: Ctx, f: LeadFilters) {
  const today = todayIST()
  const and: Record<string, unknown>[] = [leadAccess(ctx)]
  if (f.stage) and.push({ stage: f.stage })
  if (f.ownerId) and.push({ ownerId: oid(f.ownerId) })
  if (f.source) and.push({ source: f.source })
  if (f.followupDue === 'overdue') and.push({ 'nextFollowUp.dueDate': { $lt: today } })
  if (f.followupDue === 'today') and.push({ 'nextFollowUp.dueDate': today })
  if (f.followupDue === 'week') and.push({ 'nextFollowUp.dueDate': { $gte: today, $lte: addDays(today, 7) } })
  if (f.query) and.push({ $or: ['companyName', 'contactName', 'email'].map((k) => ({ [k]: new RegExp(escapeRegex(f.query!), 'i') })) })
  const rows = await ctx.db(Lead).find({ $and: and }, { companyName: 1, contactName: 1, email: 1, phone: 1, stage: 1, source: 1, ownerId: 1, valuePaise: 1, nextFollowUp: 1, lastActivityAt: 1 }).sort({ updatedAt: -1 }).limit(Math.min(f.limit ?? LIMIT, 100)).lean()
  const people = await memberNames(ctx, rows.map((l) => l.ownerId))
  return {
    count: rows.length,
    leads: rows.map((l) => ({ id: String(l._id), company: l.companyName, contact: l.contactName || null, email: l.email || null, phone: l.phone || null, stage: l.stage, source: l.source, owner: people.get(String(l.ownerId)) ?? null, value: rupees(l.valuePaise), next_followup: l.nextFollowUp ? { title: l.nextFollowUp.title, due: l.nextFollowUp.dueDate } : null, last_activity: l.lastActivityAt?.toISOString() ?? null, link: recordLink('lead', String(l._id)) })),
  }
}

export async function getLead(ctx: Ctx, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError('That lead')
  const lead = await ctx.db(Lead).findOne({ $and: [leadAccess(ctx), { _id: oid(id) }] }, { companyName: 1, contactName: 1, designation: 1, email: 1, phone: 1, website: 1, stage: 1, source: 1, sector: 1, ownerId: 1, valuePaise: 1, notes: 1, nextFollowUp: 1, createdAt: 1 }).lean()
  if (!lead) throw new NotFoundError('That lead')
  const activities = await ctx.db(Activity).find({ leadId: lead._id }, { type: 1, status: 1, title: 1, notes: 1, occurredAt: 1, dueDate: 1, assigneeId: 1 }).sort({ createdAt: -1 }).limit(30).lean()
  const people = await memberNames(ctx, [lead.ownerId, ...activities.map((a) => a.assigneeId)])
  return {
    id: String(lead._id), company: lead.companyName, contact: lead.contactName || null, designation: lead.designation || null, email: lead.email || null, phone: lead.phone || null, website: lead.website || null,
    stage: lead.stage, source: lead.source, sector: lead.sector, owner: people.get(String(lead.ownerId)) ?? null, value: rupees(lead.valuePaise), notes: lead.notes || '',
    next_followup: lead.nextFollowUp ? { title: lead.nextFollowUp.title, due: lead.nextFollowUp.dueDate } : null,
    activities: activities.map((a) => ({ type: a.type, status: a.status, title: a.title || null, notes: (a.notes ?? '').slice(0, 1000), at: a.occurredAt?.toISOString() ?? a.dueDate ?? null, by: people.get(String(a.assigneeId)) ?? null })),
    link: recordLink('lead', String(lead._id)),
  }
}

export async function pipelineSummary(ctx: Ctx) {
  const cfg = await getOrbitSettings(ctx)
  const today = todayIST()
  const open = await ctx.db(Deal).find({ $and: [dealAccess(ctx), { status: 'open' }] }, { title: 1, stage: 1, valuePaise: 1, probability: 1, expectedCloseDate: 1, clientId: 1 }).lean()
  const clients = await clientNames(ctx, open.map((d) => d.clientId))
  const byStage = cfg.dealStages.map((s) => {
    const deals = open.filter((d) => d.stage === s.key)
    const value = deals.reduce((n, d) => n + (d.valuePaise ?? 0), 0)
    return { stage: s.label, deals: deals.length, value: rupees(value), weighted: rupees(deals.reduce((n, d) => n + ((d.valuePaise ?? 0) * (d.probability ?? 0)) / 100, 0)) }
  })
  const weekEnd = addDays(today, 7)
  const closing = open.filter((d) => d.expectedCloseDate && d.expectedCloseDate <= weekEnd).sort((a, b) => String(a.expectedCloseDate).localeCompare(String(b.expectedCloseDate)))
  const total = open.reduce((n, d) => n + (d.valuePaise ?? 0), 0)
  return {
    open_deals: open.length, open_value: rupees(total), open_value_text: formatINR(total, { decimals: 0 }), by_stage: byStage,
    closing_this_week: closing.map((d) => ({ id: String(d._id), title: d.title, client: d.clientId ? (clients.get(String(d.clientId)) ?? null) : null, value: rupees(d.valuePaise), expected_close: d.expectedCloseDate, overdue: (d.expectedCloseDate ?? '') < today, link: recordLink('deal', String(d._id)) })),
  }
}

// ---------------------------------------------------------------------------
// Folio (read)
// ---------------------------------------------------------------------------

export async function receivables(ctx: Ctx) {
  const today = todayIST()
  const rows = await listOutstanding(ctx, undefined, today)
  const aging = summariseAging(rows, today)
  const byClient = new Map<string, { client: string; balance: number; oldest: number }>()
  for (const r of rows) {
    const cur = byClient.get(r.clientId) ?? { client: r.clientName, balance: 0, oldest: 0 }
    byClient.set(r.clientId, { ...cur, balance: cur.balance + r.balancePaise, oldest: Math.max(cur.oldest, r.daysOverdue) })
  }
  const top = [...byClient.entries()].filter(([, v]) => v.oldest > 0).sort((a, b) => b[1].balance - a[1].balance).slice(0, 10)
  return {
    total_due: rupees(aging.total), overdue: rupees(aging.overdue),
    aging: { current: rupees(aging.current), d1_30: rupees(aging['1_30']), d31_60: rupees(aging['31_60']), d61_90: rupees(aging['61_90']), d90_plus: rupees(aging['90_plus']) },
    top_overdue_clients: top.map(([id, v]) => ({ client: v.client, balance: rupees(v.balance), oldest_days_overdue: v.oldest, link: recordLink('client', id) })),
    overdue_invoices: collectionPriority(rows.filter((r) => r.daysOverdue > 0), today).slice(0, 25).map((r) => ({ id: r.invoiceId, number: r.number, client: r.clientName, due: r.dueDate, days_overdue: r.daysOverdue, balance: rupees(r.balancePaise), link: recordLink('invoice', r.invoiceId) })),
  }
}

export async function getInvoice(ctx: Ctx, idOrNumber: string) {
  const filter = Types.ObjectId.isValid(idOrNumber) ? { _id: oid(idOrNumber) } : { number: idOrNumber.trim() }
  const inv = await ctx.db(Invoice).findOne(filter, { number: 1, status: 1, clientId: 1, issueDate: 1, dueDate: 1, totalPaise: 1, balancePaise: 1, taxablePaise: 1, cgstPaise: 1, sgstPaise: 1, igstPaise: 1, lines: 1, subject: 1 }).lean()
  if (!inv) throw new NotFoundError('That invoice')
  const [clients, receipts] = await Promise.all([clientNames(ctx, [inv.clientId]), ctx.db(FolioReceipt).find({ 'allocations.invoiceId': inv._id }, { number: 1, receiptDate: 1, mode: 1, allocations: 1 }).lean()])
  return {
    id: String(inv._id), number: inv.number ?? null, status: inv.status, client: clients.get(String(inv.clientId)) ?? null, subject: inv.subject ?? null, issue_date: inv.issueDate, due_date: inv.dueDate,
    taxable: rupees(inv.taxablePaise), gst: rupees((inv.cgstPaise ?? 0) + (inv.sgstPaise ?? 0) + (inv.igstPaise ?? 0)), total: rupees(inv.totalPaise), balance: rupees(inv.balancePaise),
    lines: (inv.lines ?? []).map((l) => ({ description: l.description, quantity: l.quantity, rate: rupees(l.ratePaise), gst_percent: l.gstRatePercent })),
    payments: receipts.map((r) => ({ receipt: r.number, date: (r as { receiptDate?: string }).receiptDate ?? null, mode: r.mode, amount: rupees((r.allocations ?? []).filter((a) => String(a.invoiceId) === String(inv._id)).reduce((n, a) => n + (a.amountPaise ?? 0), 0)) })),
    link: recordLink('invoice', String(inv._id)),
  }
}

export async function statementFor(ctx: Ctx, clientId: string, range: { from?: string; to?: string }) {
  const st = await clientStatement(ctx, clientId, range)
  if (!st) throw new NotFoundError('That client')
  const s = st.statement
  return {
    client: st.client.name, from: range.from ?? null, to: range.to ?? null,
    brought_forward: rupees(s.broughtForwardPaise), closing: rupees(s.closingPaise), billed: rupees(s.debitPaise), settled: rupees(s.creditPaise),
    rows: s.rows.slice(-60).map((r) => ({ date: r.date, type: r.type, document: r.document, particulars: r.particulars, debit: rupees(r.debitPaise), credit: rupees(r.creditPaise), balance: rupees(r.balancePaise) })),
    link: recordLink('client', clientId),
  }
}

// ---------------------------------------------------------------------------
// People (read only: directory and leave)
// ---------------------------------------------------------------------------

export async function directory(ctx: Ctx, query?: string) {
  const members = await ctx.db(Member).find({ status: 'active' }, { userId: 1, title: 1, department: 1, managerId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1 }).lean()
  const teams = ctx.has('work') ? await ctx.db(Team).find({ isActive: { $ne: false } }, { name: 1, 'members.memberId': 1 }).lean() : []
  const byUser = new Map(users.map((u) => [String(u._id), u]))
  const nameOf = new Map(members.map((m) => [String(m._id), byUser.get(String(m.userId))?.name ?? 'Member']))
  const q = query?.trim().toLowerCase()
  const rows = members
    .map((m) => {
      const u = byUser.get(String(m.userId))
      return {
        id: String(m._id), name: u?.name ?? 'Member', email: u?.email ?? null, title: m.title ?? null, department: m.department ?? null,
        manager: m.managerId ? (nameOf.get(String(m.managerId)) ?? null) : null,
        teams: teams.filter((t) => (t.members ?? []).some((x) => String(x.memberId) === String(m._id))).map((t) => t.name),
      }
    })
    .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q) || (r.department ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { count: rows.length, people: rows.slice(0, 200) }
}

/** Approved leave overlapping today … `days` ahead. Reasons and leave types stay private. */
export async function whoIsOut(ctx: Ctx, days: number) {
  if (!ctx.has('muster')) return { from: todayIST(), to: todayIST(), out: [], note: 'Muster (HR) is not on for this workspace, so leave is not tracked in Flowbit.' }
  const from = todayIST()
  const to = addDays(from, Math.max(0, Math.min(days, 31)))
  const rows = await ctx.db(LeaveRequest).find({ status: 'approved', startDate: { $lte: to }, endDate: { $gte: from } }, { employeeId: 1, startDate: 1, endDate: 1, isHalfDay: 1, dates: 1 }).sort({ startDate: 1 }).limit(200).lean()
  const employees = await ctx.db(Employee).find({ _id: { $in: rows.map((r) => r.employeeId) } }, { fullName: 1, memberId: 1 }).lean()
  const names = new Map(employees.map((e) => [String(e._id), { name: e.fullName, memberId: e.memberId ? String(e.memberId) : null }]))
  return {
    from, to,
    out: rows.map((r) => ({ name: names.get(String(r.employeeId))?.name ?? 'Employee', member_id: names.get(String(r.employeeId))?.memberId ?? null, from: r.startDate, to: r.endDate, half_day: Boolean(r.isHalfDay), days_in_range: (r.dates ?? []).filter((d) => d >= from && d <= to) })),
  }
}
