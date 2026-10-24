import type { Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { withLease } from '@/lib/lease'
import { Invoice } from '@/models/folio/Invoice'
import { FolioRetainer } from '@/models/folio/Retainer'
import type { FolioDb } from '../context'
import { dueBillingDates, servicePeriodFor, type RetainerFrequency } from '../engine/numbering'
import { createDraftInvoice, type ServiceCtx } from '../invoices/service'
import { gapBillingDates, type BilledPeriod } from './schedule-math'

/**
 * Retainer drafts, generated statelessly: every billing date due up to `asOf`
 * after the latest non-void invoice (and on or after `resumeFrom`) gets a
 * draft, oldest first. Drafts count as billed, so running twice never bills
 * twice; deleting a draft or voiding its invoice makes that period due again,
 * including one behind the latest invoice (see gapBillingDates). Counting from
 * the latest invoice (not from startDate) means editing the billing day or
 * frequency, or a pause, never re-bills past periods.
 */

const FAR_FUTURE = '9999-12-31'
/** Enough periods to step past a long pause when finding the next invoice date. */
const MAX_LOOKAHEAD = 120

export type RetainerLike = { _id: Types.ObjectId; startDate: string; endDate?: string | null; frequency: RetainerFrequency; billingDay: number; billInAdvance?: boolean | null; status: string; resumeFrom?: string | null }

export type RetainerSchedule = { due: string[]; next: string | null; raised: number }

/** Billing dates already raised (non-void invoices) with the periods they cover, per retainer. */
async function billedPeriods(ctx: FolioDb, retainerIds: Types.ObjectId[]): Promise<Map<string, BilledPeriod[]>> {
  if (!retainerIds.length) return new Map()
  const rows = await ctx.db(Invoice).find({ retainerId: { $in: retainerIds }, status: { $ne: 'void' } }, { retainerId: 1, retainerBillingDate: 1, periodStart: 1, periodEnd: 1 }).lean()
  const map = new Map<string, BilledPeriod[]>()
  for (const r of rows) {
    if (!r.retainerBillingDate) continue
    const key = String(r.retainerId)
    map.set(key, [...(map.get(key) ?? []), { date: r.retainerBillingDate, start: r.periodStart ?? null, end: r.periodEnd ?? null }])
  }
  return map
}

/** Unbilled due dates, the next invoice date and how many invoices were raised, per retainer. */
export async function retainerSchedules(ctx: FolioDb, retainers: RetainerLike[], asOf: string): Promise<Map<string, RetainerSchedule>> {
  const billed = await billedPeriods(ctx, retainers.map((r) => r._id))
  return new Map(
    retainers.map((r) => {
      const periods = billed.get(String(r._id)) ?? []
      const done = new Set(periods.map((p) => p.date))
      const last = [...done].sort().at(-1) ?? null
      const resumed = (d: string) => !r.resumeFrom || d >= r.resumeFrom
      const schedule = { ...r, lastInvoicedOn: last }
      const gaps = gapBillingDates(r, periods).filter((d) => d <= asOf)
      const due = r.status === 'active' ? [...gaps, ...dueBillingDates(schedule, asOf)].filter((d) => !done.has(d) && resumed(d)) : []
      const upcoming = r.status === 'active' ? dueBillingDates(schedule, FAR_FUTURE, MAX_LOOKAHEAD).find(resumed) ?? null : null
      return [String(r._id), { due, next: due[0] ?? upcoming, raised: done.size }]
    }),
  )
}

export type GenerateResult = { created: { retainerId: string; invoiceId: string; billingDate: string }[]; skipped: { retainerId: string; name: string; reason: string }[] }

/** Shown when another run (the daily job or a colleague's button) is drafting this workspace's retainers. */
export const RETAINERS_BUSY = 'Another run is drafting retainer invoices right now. Try again in a minute.'

/**
 * Drafts every due retainer period. One run per workspace at a time (a lease
 * shared by the daily job, "Generate due drafts" and "Bill now"): drafting
 * checks what is billed and then creates, so two overlapping runs could
 * otherwise draft the same period twice.
 */
export async function generateRetainerInvoices(ctx: ServiceCtx, asOf: string, opts: { retainerIds?: string[]; autoOnly?: boolean } = {}): Promise<GenerateResult> {
  const outcome = await withLease(`folio-retainers:${String(ctx.orgId)}`, () => draftDueRetainers(ctx, asOf, opts))
  return outcome.ran ? outcome.result : { created: [], skipped: [{ retainerId: '', name: 'Retainer drafts', reason: RETAINERS_BUSY }] }
}

async function draftDueRetainers(ctx: ServiceCtx, asOf: string, opts: { retainerIds?: string[]; autoOnly?: boolean }): Promise<GenerateResult> {
  const retainers = await ctx.db(FolioRetainer).find({ status: 'active', ...(opts.autoOnly ? { autoGenerate: true } : {}), ...(opts.retainerIds ? { _id: { $in: opts.retainerIds } } : {}) }).lean()
  const schedules = await retainerSchedules(ctx, retainers, asOf)
  const result: GenerateResult = { created: [], skipped: [] }
  for (const retainer of retainers) {
    const dates = schedules.get(String(retainer._id))?.due ?? []
    try {
      for (const date of dates) {
        const period = servicePeriodFor(date, retainer.frequency, retainer.billingDay, retainer.billInAdvance)
        const draft = await createDraftInvoice(ctx, {
          entityId: String(retainer.entityId),
          clientId: String(retainer.clientId),
          supplyMode: 'auto',
          lines: [{ description: retainer.description || retainer.name, hsnSac: retainer.hsnSac ?? undefined, quantity: 1, unit: retainer.frequency === 'monthly' ? 'month' : 'period', rate: retainer.amountPaise / 100, discountPercent: 0, gstRatePercent: retainer.gstRatePercent }],
          discountType: 'none',
          discountValue: 0,
          issueDate: date,
          paymentTermsDays: retainer.paymentTermsDays ?? null,
          billingType: 'retainer',
          retainerId: retainer._id,
          retainerBillingDate: date,
          periodStart: period.start,
          periodEnd: period.end,
          subject: `${retainer.name} · ${formatDate(period.start)} to ${formatDate(period.end)}`,
        })
        result.created.push({ retainerId: String(retainer._id), invoiceId: String(draft.id), billingDate: date })
      }
    } catch (error) {
      const reason = error instanceof UserError ? error.message : 'Something went wrong while drafting it.'
      if (!(error instanceof UserError)) console.error('[folio] retainer generation failed', String(retainer._id), error)
      result.skipped.push({ retainerId: String(retainer._id), name: retainer.name, reason })
    }
  }
  return result
}

/** Monthly run rate: monthly = amount, quarterly /3, half-yearly /6, annual /12. */
export function monthlyRunRate(retainers: { amountPaise: number; frequency: RetainerFrequency; status: string }[]): number {
  const per = { monthly: 1, quarterly: 3, half_yearly: 6, annual: 12 } as const
  return Math.round(retainers.filter((r) => r.status === 'active').reduce((t, r) => t + r.amountPaise / per[r.frequency], 0))
}
