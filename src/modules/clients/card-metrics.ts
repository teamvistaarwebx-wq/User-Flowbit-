import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { addDays } from '@/lib/dates'
import { CreditNote } from '@/models/folio/CreditNote'
import { Invoice } from '@/models/folio/Invoice'
import { FolioRetainer } from '@/models/folio/Retainer'
import { Employee } from '@/models/muster/Employee'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TimeEntry } from '@/models/work/TimeEntry'
import { clientColumns } from './columns'
import { costByClient, hourlyCostPaise, MARGIN_WINDOW_DAYS, marginOf, minutesByClient, type Margin } from './dashboard-math'

/**
 * Card numbers for the clients on one page (at most a page of ids): hours logged this month against the
 * retainer, and margin over the last MARGIN_WINDOW_DAYS. Margin is only computed for viewers who may see
 * salaries (payroll.read) and Folio; everyone else gets null and the page omits it.
 */

export type CardMetrics = { minutesThisMonth: Map<string, number>; retainerHours: Map<string, number>; margin: Map<string, Margin> | null }

type TimeRow = { _id: { projectId?: Types.ObjectId | null; taskId?: Types.ObjectId | null; memberId: Types.ObjectId; inMonth: boolean }; minutes: number }
export type TimeSlice = { projectId: string | null; taskId: string | null; memberId: string; minutes: number; inMonth: boolean }

/** Minutes per project/task/member since `from` on the given clients' projects and tasks, split at `monthStart`. */
async function timeFor(ctx: Ctx, ids: Types.ObjectId[], from: string, monthStart: string) {
  const [projects, tasks] = await Promise.all([ctx.db(Project).find({ clientId: { $in: ids } }, { clientId: 1 }).lean(), ctx.db(Task).find({ clientId: { $in: ids } }, { clientId: 1 }).lean()])
  const projectClient = new Map(projects.map((p) => [String(p._id), String(p.clientId)]))
  const taskClient = new Map(tasks.map((t) => [String(t._id), String(t.clientId)]))
  if (!projects.length && !tasks.length) return { rows: [] as TimeSlice[], projectClient, taskClient }
  const raw = await ctx.db(TimeEntry).aggregate<TimeRow>([
    { $match: { date: { $gte: from }, $or: [{ projectId: { $in: projects.map((p) => p._id) } }, { taskId: { $in: tasks.map((t) => t._id) } }] } },
    { $group: { _id: { projectId: '$projectId', taskId: '$taskId', memberId: '$memberId', inMonth: { $gte: ['$date', monthStart] } }, minutes: { $sum: '$minutes' } } },
  ])
  const rows: TimeSlice[] = raw.map((r) => ({ projectId: r._id.projectId ? String(r._id.projectId) : null, taskId: r._id.taskId ? String(r._id.taskId) : null, memberId: String(r._id.memberId), minutes: r.minutes, inMonth: r._id.inMonth }))
  return { rows, projectClient, taskClient }
}

/** Hourly salary cost per member (annual CTC of the current structure). */
async function hourlyCosts(ctx: Ctx, memberIds: string[]): Promise<Map<string, number>> {
  if (!memberIds.length) return new Map()
  const employees = await ctx.db(Employee).find({ memberId: { $in: memberIds } }, { memberId: 1 }).lean()
  const structures = await ctx.db(SalaryStructure).find({ employeeId: { $in: employees.map((e) => e._id) }, effectiveTo: null }, { employeeId: 1, ctcAnnual: 1 }).lean()
  const ctc = new Map(structures.map((s) => [String(s.employeeId), s.ctcAnnual]))
  return new Map(employees.map((e) => [String(e.memberId), hourlyCostPaise(ctc.get(String(e._id)) ?? 0)]))
}

/** Taxable revenue per client since `from`, net of credit notes. */
async function revenueSince(ctx: Ctx, ids: Types.ObjectId[], from: string): Promise<Map<string, number>> {
  const [billed, credited] = await Promise.all([
    ctx.db(Invoice).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { clientId: { $in: ids }, status: { $in: ['issued', 'part_paid', 'paid'] }, billingType: { $ne: 'opening' }, issueDate: { $gte: from } } }, { $group: { _id: '$clientId', n: { $sum: '$taxablePaise' } } }]),
    ctx.db(CreditNote).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { clientId: { $in: ids }, status: 'issued', noteDate: { $gte: from } } }, { $group: { _id: '$clientId', n: { $sum: '$taxablePaise' } } }]),
  ])
  const credit = new Map(credited.map((c) => [String(c._id), c.n]))
  return new Map(billed.map((b) => [String(b._id), b.n - (credit.get(String(b._id)) ?? 0)]))
}

export async function cardMetrics(ctx: Ctx, ids: Types.ObjectId[], today: string): Promise<CardMetrics> {
  const cols = clientColumns(ctx)
  const monthStart = `${today.slice(0, 7)}-01`
  const marginFrom = addDays(today, -MARGIN_WINDOW_DAYS)
  if (!ids.length || !cols.work) return { minutesThisMonth: new Map(), retainerHours: new Map(), margin: null }
  const from = cols.margin && marginFrom < monthStart ? marginFrom : monthStart
  const [time, retainers] = await Promise.all([
    timeFor(ctx, ids, from, monthStart),
    cols.folio ? ctx.db(FolioRetainer).find({ clientId: { $in: ids }, status: 'active', hoursPerMonth: { $gt: 0 } }, { clientId: 1, hoursPerMonth: 1 }).lean() : [],
  ])
  const minutesThisMonth = minutesByClient(time.rows.filter((r) => r.inMonth), time.projectClient, time.taskClient)
  const retainerHours = new Map<string, number>()
  for (const r of retainers) retainerHours.set(String(r.clientId), (retainerHours.get(String(r.clientId)) ?? 0) + (r.hoursPerMonth ?? 0))
  if (!cols.margin) return { minutesThisMonth, retainerHours, margin: null }
  const withClient = time.rows.flatMap((r) => {
    const client = (r.projectId ? time.projectClient.get(r.projectId) : undefined) ?? (r.taskId ? time.taskClient.get(r.taskId) : undefined)
    return client ? [{ client, memberId: r.memberId, minutes: r.minutes }] : []
  })
  const [hourly, revenue] = await Promise.all([hourlyCosts(ctx, [...new Set(withClient.map((r) => r.memberId))]), revenueSince(ctx, ids, marginFrom)])
  const cost = costByClient(withClient, hourly)
  const margin = new Map(ids.map((id) => [String(id), marginOf(revenue.get(String(id)) ?? 0, cost.get(String(id)) ?? 0)]))
  return { minutesThisMonth, retainerHours, margin }
}
