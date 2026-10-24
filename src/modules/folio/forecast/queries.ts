import 'server-only'
import type { Types } from 'mongoose'
import { todayIST } from '@/lib/dates'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { Invoice } from '@/models/folio/Invoice'
import { FolioRetainer } from '@/models/folio/Retainer'
import { clientNameMap, entityMatch, listEntities, type FolioScope } from '@/modules/folio/queries/common'
import { milestoneAmount } from '@/modules/folio/recurring/plan-math'
import { buildForecast, type Forecast, type ForecastMilestone, type ForecastRetainer } from './forecast'

/** Expected billing from active retainers and pending milestones, with the names a page needs. */

export const FORECAST_MONTHS = 6

export type ForecastView = Forecast & { clientNames: Record<string, string>; firmNames: Record<string, string> }

/** Billing dates of issued (not draft, not void) retainer invoices, per retainer. */
async function issuedRetainerDates(scope: FolioScope, ids: Types.ObjectId[]): Promise<Map<string, string[]>> {
  if (!ids.length) return new Map()
  const rows = await scope.db(Invoice).find({ retainerId: { $in: ids }, status: { $nin: ['draft', 'void'] } }, { retainerId: 1, retainerBillingDate: 1 }).lean()
  const map = new Map<string, string[]>()
  for (const r of rows) if (r.retainerBillingDate) map.set(String(r.retainerId), [...(map.get(String(r.retainerId)) ?? []), r.retainerBillingDate])
  return map
}

async function retainerInputs(scope: FolioScope, entityId: string | null): Promise<ForecastRetainer[]> {
  const retainers = await scope.db(FolioRetainer).find({ status: 'active', ...entityMatch(entityId) }).lean()
  const issued = await issuedRetainerDates(scope, retainers.map((r) => r._id))
  return retainers.map((r) => ({
    id: String(r._id),
    name: r.name,
    clientId: String(r.clientId),
    entityId: String(r.entityId),
    amountPaise: r.amountPaise,
    gstRatePercent: r.gstRatePercent ?? 0,
    frequency: r.frequency,
    billingDay: r.billingDay ?? 1,
    startDate: r.startDate,
    endDate: r.endDate ?? null,
    resumeFrom: r.resumeFrom ?? null,
    issuedDates: issued.get(String(r._id)) ?? [],
  }))
}

/** Pending phases of active plans; a phase whose invoice is still a draft counts as expected. */
async function milestoneInputs(scope: FolioScope, entityId: string | null): Promise<ForecastMilestone[]> {
  const plans = await scope.db(FolioBillingPlan).find({ status: 'active', ...entityMatch(entityId) }).lean()
  const linked = plans.flatMap((p) => p.milestones.map((m) => m.invoiceId).filter((id): id is Types.ObjectId => Boolean(id)))
  const drafts = linked.length ? new Set((await scope.db(Invoice).find({ _id: { $in: linked }, status: 'draft' }, { _id: 1 }).lean()).map((i) => String(i._id))) : new Set<string>()
  return plans.flatMap((p) =>
    p.milestones
      .filter((m) => m.status === 'pending' && (!m.invoiceId || drafts.has(String(m.invoiceId))))
      .map((m) => ({ id: String(m._id), label: `${p.name} · ${m.name}`, clientId: String(p.clientId), entityId: String(p.entityId), amountPaise: milestoneAmount(p.totalValuePaise, m), gstRatePercent: p.gstRatePercent ?? 0, dueOn: m.dueOn ?? null }))
      .filter((m) => m.amountPaise > 0),
  )
}

export async function billingForecast(scope: FolioScope, opts: { entityId?: string | null; months?: number; today?: string } = {}): Promise<ForecastView> {
  const entityId = opts.entityId ?? null
  const today = opts.today ?? todayIST()
  const [retainers, milestones, entities] = await Promise.all([retainerInputs(scope, entityId), milestoneInputs(scope, entityId), listEntities(scope)])
  const forecast = buildForecast({ today, months: opts.months ?? FORECAST_MONTHS, retainers, milestones })
  const names = await clientNameMap(scope, [...new Set([...forecast.lines, ...forecast.unscheduled].map((l) => l.clientId))])
  return {
    ...forecast,
    clientNames: Object.fromEntries(names),
    firmNames: Object.fromEntries(entities.map((e) => [e.id, e.tradeName || e.legalName])),
  }
}
