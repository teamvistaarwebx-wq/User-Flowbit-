import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { istInstant, TIMEZONE } from '@/lib/dates'
import { Client, CLIENT_STATUSES } from '@/models/Client'
import { CreditNote } from '@/models/folio/CreditNote'
import { Invoice } from '@/models/folio/Invoice'
import { Activity } from '@/models/orbit/Activity'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TimeEntry } from '@/models/work/TimeEntry'
import { clientColumns } from './columns'
import { fillMonths, healthCounts, lastMonths, newSince, topBy, TREND_MONTHS, type HealthCounts } from './dashboard-math'
import { clientSignals, lastTouch, type AllSignals } from './signals'

/** Clients for the workspace-wide health count; beyond this the count covers the most recently updated ones. */
const HEALTH_CAP = 5000
const TOP_CLIENTS = 8

export type ClientDashboard = {
  total: number
  new30: number
  activeThisMonth: number
  /** Null when the viewer has no Folio access. */
  overduePaise: number | null
  byStatus: Record<(typeof CLIENT_STATUSES)[number], number>
  health: HealthCounts
  months: string[]
  newPerMonth: number[]
  /** Null without Folio access. */
  topRevenue: { id: string; name: string; value: number }[] | null
}

type Id = Types.ObjectId

/** Clients with any work or contact this month: an Orbit activity, an issued invoice or time on their projects or tasks. */
async function activeClientIds(ctx: Ctx, today: string): Promise<Set<string>> {
  const cols = clientColumns(ctx)
  const monthStart = `${today.slice(0, 7)}-01`
  const [activities, invoices, time] = await Promise.all([
    cols.orbit ? ctx.db(Activity).distinct('clientId', { clientId: { $ne: null }, status: 'done', occurredAt: { $gte: istInstant(monthStart) } }) : [],
    cols.folio ? ctx.db(Invoice).distinct('clientId', { status: { $in: ['issued', 'part_paid', 'paid'] }, issueDate: { $gte: monthStart } }) : [],
    cols.work ? ctx.db(TimeEntry).aggregate<{ _id: { projectId: Id | null; taskId: Id | null } }>([{ $match: { date: { $gte: monthStart } } }, { $group: { _id: { projectId: '$projectId', taskId: '$taskId' } } }]) : [],
  ])
  const projectIds = time.flatMap((t) => (t._id.projectId ? [t._id.projectId] : []))
  const taskIds = time.flatMap((t) => (t._id.taskId ? [t._id.taskId] : []))
  const [fromProjects, fromTasks] = await Promise.all([
    projectIds.length ? ctx.db(Project).distinct('clientId', { _id: { $in: projectIds }, clientId: { $ne: null } }) : [],
    taskIds.length ? ctx.db(Task).distinct('clientId', { _id: { $in: taskIds }, clientId: { $ne: null } }) : [],
  ])
  return new Set([...activities, ...invoices, ...fromProjects, ...fromTasks].map(String))
}

async function topRevenue(ctx: Ctx, from: string): Promise<ClientDashboard['topRevenue']> {
  const [billed, credited] = await Promise.all([
    ctx.db(Invoice).aggregate<{ _id: Id; n: number }>([{ $match: { status: { $in: ['issued', 'part_paid', 'paid'] }, billingType: { $ne: 'opening' }, issueDate: { $gte: from } } }, { $group: { _id: '$clientId', n: { $sum: '$taxablePaise' } } }]),
    ctx.db(CreditNote).aggregate<{ _id: Id; n: number }>([{ $match: { status: 'issued', noteDate: { $gte: from } } }, { $group: { _id: '$clientId', n: { $sum: '$taxablePaise' } } }]),
  ])
  const credit = new Map(credited.map((c) => [String(c._id), c.n]))
  const ranked = topBy(billed.map((b) => ({ id: String(b._id), name: '', value: b.n - (credit.get(String(b._id)) ?? 0) })), TOP_CLIENTS)
  const names = new Map((await ctx.db(Client).find({ _id: { $in: ranked.map((r) => r.id) } }, { name: 1 }).lean()).map((c) => [String(c._id), c.name]))
  return ranked.map((r) => ({ ...r, name: names.get(r.id) ?? 'Unknown client' }))
}

/** KPI tiles and charts for the Clients page: a handful of grouped queries, no per-client lookups. */
export async function clientDashboard(ctx: Ctx, today: string, allSignals: AllSignals = () => clientSignals(ctx, 'all', today)): Promise<ClientDashboard> {
  const cols = clientColumns(ctx)
  const months = lastMonths(today, TREND_MONTHS)
  const trendStart = `${months[0]}-01`
  const [statusRows, new30, monthRows, active, current, signals, top] = await Promise.all([
    ctx.db(Client).aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ctx.db(Client).countDocuments({ createdAt: { $gte: istInstant(newSince(today, 30)) } }),
    ctx.db(Client).aggregate<{ _id: string; n: number }>([{ $match: { createdAt: { $gte: istInstant(trendStart) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: TIMEZONE } }, n: { $sum: 1 } } }]),
    activeClientIds(ctx, today),
    ctx.db(Client).find({ status: 'active' }, { updatedAt: 1 }).sort({ updatedAt: -1 }).limit(HEALTH_CAP).lean(),
    allSignals(),
    cols.folio ? topRevenue(ctx, trendStart) : null,
  ])
  const byStatus = Object.fromEntries(CLIENT_STATUSES.map((s) => [s, statusRows.find((r) => r._id === s)?.n ?? 0])) as ClientDashboard['byStatus']
  const health = healthCounts(current.map((c) => {
    const s = signals.get(String(c._id))
    return { overduePaise: s?.overduePaise ?? 0, oldestOverdueDue: s?.oldestOverdueDue ?? null, lastTouchAt: lastTouch(s, c.updatedAt), today }
  }))
  const overduePaise = cols.folio ? [...signals.values()].reduce((sum, s) => sum + s.overduePaise, 0) : null
  return {
    total: statusRows.reduce((sum, r) => sum + r.n, 0),
    new30,
    activeThisMonth: active.size,
    overduePaise,
    byStatus,
    health,
    months,
    newPerMonth: fillMonths(monthRows.map((r) => ({ month: r._id, n: r.n })), months),
    topRevenue: top,
  }
}
