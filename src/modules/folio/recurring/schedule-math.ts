import { dueBillingDates, servicePeriodFor, type BillingSchedule } from '../engine/numbering'

/** A live (non-void) retainer invoice: its billing date and, when stored, the service period it covers. */
export type BilledPeriod = { date: string; start?: string | null; end?: string | null }

/** Enough periods to walk a long-running retainer from its start to its latest invoice. */
const MAX_GAP_SCAN = 240

/**
 * Billing dates between the first and the latest live invoice that nothing
 * bills any more: a deleted draft or a voided invoice in the middle of the
 * run (folio.md §6.9, "makes that period due again"). A date counts as billed
 * when an invoice carries it, or when its service period overlaps one an
 * invoice already covers, so changing the frequency, billing day or start
 * date never re-bills the past.
 */
export function gapBillingDates(retainer: Omit<BillingSchedule, 'lastInvoicedOn'> & { billInAdvance?: boolean | null }, billed: BilledPeriod[]): string[] {
  const sorted = billed.map((b) => b.date).sort()
  const first = sorted[0]
  const last = sorted.at(-1)
  if (!first || !last) return []
  const dates = new Set(billed.map((b) => b.date))
  const covered = billed.filter((b): b is { date: string; start: string; end: string } => Boolean(b.start && b.end))
  return dueBillingDates({ ...retainer, lastInvoicedOn: null }, last, MAX_GAP_SCAN).filter((d) => {
    if (d <= first || dates.has(d)) return false
    const period = servicePeriodFor(d, retainer.frequency, retainer.billingDay, retainer.billInAdvance !== false)
    return !covered.some((b) => b.start <= period.end && period.start <= b.end)
  })
}
