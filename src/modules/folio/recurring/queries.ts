import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { Client } from '@/models/Client'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioRetainer } from '@/models/folio/Retainer'
import { monthlyRunRate, retainerSchedules } from './generate'
import { allocatedOf } from './plan-math'
import { invoicedByPlan } from './plans'

/** Reads for the Recurring page: retainers with their schedules, plans with billed progress. */

async function namesFor(ctx: Ctx, clientIds: unknown[]) {
  const clients = await ctx.db(Client).find({ _id: { $in: clientIds } }, { name: 1 }).lean()
  return new Map(clients.map((c) => [String(c._id), c.name]))
}

export async function retainerOverview(ctx: Ctx) {
  const today = todayIST()
  const [retainers, entities] = await Promise.all([ctx.db(FolioRetainer).find({}).sort({ status: 1, name: 1 }).lean(), ctx.db(FolioEntity).find({}, { code: 1, kind: 1 }).lean()])
  const [schedules, names] = await Promise.all([retainerSchedules(ctx, retainers, today), namesFor(ctx, retainers.map((r) => r.clientId))])
  const entityOf = new Map(entities.map((e) => [String(e._id), e]))
  const rows = retainers.map((r) => {
    const schedule = schedules.get(String(r._id)) ?? { due: [], next: null, raised: 0 }
    return { ...r, clientName: names.get(String(r.clientId)) ?? 'Unknown client', entityCode: entityOf.get(String(r.entityId))?.code ?? '', entityKind: entityOf.get(String(r.entityId))?.kind ?? 'gst', schedule }
  })
  const due = rows.filter((r) => r.schedule.due.length)
  return {
    rows,
    activeCount: rows.filter((r) => r.status === 'active').length,
    runRatePaise: monthlyRunRate(retainers),
    dueCount: due.length,
    dueDrafts: due.reduce((t, r) => t + r.schedule.due.length, 0),
    oldestDue: due.map((r) => r.schedule.due[0]).sort()[0] ?? null,
  }
}

export type RetainerRow = Awaited<ReturnType<typeof retainerOverview>>['rows'][number]

export async function planOverview(ctx: Ctx) {
  const plans = await ctx.db(FolioBillingPlan).find({}).sort({ createdAt: -1 }).lean()
  const [invoiced, names] = await Promise.all([invoicedByPlan(ctx, plans.map((p) => p._id)), namesFor(ctx, plans.map((p) => p.clientId))])
  return plans.map((p) => {
    const billed = invoiced.get(String(p._id)) ?? 0
    return { ...p, clientName: names.get(String(p.clientId)) ?? 'Unknown client', invoicedPaise: billed, billedPercent: p.totalValuePaise ? Math.min(100, Math.round((billed / p.totalValuePaise) * 100)) : 0, allocated: allocatedOf(p.totalValuePaise, p.milestones) }
  })
}

/** Count of retainers with at least one unbilled due date (for the invoice list button and the dashboard). */
export async function retainersDue(ctx: Ctx): Promise<{ retainers: number; drafts: number }> {
  const retainers = await ctx.db(FolioRetainer).find({ status: 'active' }).lean()
  const schedules = await retainerSchedules(ctx, retainers, todayIST())
  const due = [...schedules.values()].filter((s) => s.due.length)
  return { retainers: due.length, drafts: due.reduce((t, s) => t + s.due.length, 0) }
}
