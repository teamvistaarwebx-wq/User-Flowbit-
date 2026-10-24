import { addPeriod, quoteSelection, subscriptionInvoiceTotals, supplyTypeFor, type InvoiceTotals, type Selection, type SupplyType } from '@/lib/billing'
import { addDays, isoDateIST } from '@/lib/dates'
import type { BillingCycle, PriceOverrides } from '@/lib/plans'
import { invoiceLines, type InvoiceLine } from '@/modules/subscription/selection'
import { expectedTdsPaise, payableNowPaise } from './rules'

/**
 * What a due bill asks for (pure): the plan's lines for one period, GST by
 * place of supply, and what the customer pays online (less 2% when they
 * deduct TDS). Amounts come only from the price table, never from a form.
 */

export const DEFAULT_DUE_DAYS = 7
export const MAX_DUE_DAYS = 60

export type BillDraft = Readonly<{
  lines: InvoiceLine[]
  totals: InvoiceTotals
  supplyType: SupplyType
  periodStart: string
  periodEnd: string
  tdsPaise: number
  payableNowPaise: number
}>

/**
 * The period a bill pays for: from the end of the current paid period when
 * the plan is still running (a renewal), else from today.
 */
export function billPeriodStart(input: { now: Date; currentPeriodEnd?: Date | null; active: boolean }): Date {
  const end = input.currentPeriodEnd
  return input.active && end && end.getTime() > input.now.getTime() ? end : input.now
}

/** `discountPercent`: the first-year discount on a workspace's first yearly bill (modules/billing/first-year); a separate line. */
export function draftBill(input: { selection: Selection; cycle: BillingCycle; start: Date; supplierState: string | null; supplierGstin: string | null; customerState: string; tdsDeclared: boolean; prices?: PriceOverrides; discountPercent?: number }): BillDraft {
  const quote = quoteSelection(input.selection, input.cycle, { prices: input.prices, discountPercent: input.discountPercent })
  const end = addPeriod(input.start, input.cycle)
  const periodStart = isoDateIST(input.start)
  const periodEnd = isoDateIST(new Date(end.getTime() - 1))
  const lines = invoiceLines(quote, { start: periodStart, end: periodEnd })
  const supplyType = supplyTypeFor({ stateCode2: input.supplierState, gstin: input.supplierGstin }, input.customerState)
  const totals = subscriptionInvoiceTotals(lines, supplyType)
  const tdsPaise = input.tdsDeclared ? expectedTdsPaise(totals.taxableValuePaise) : 0
  return {
    lines,
    totals,
    supplyType,
    periodStart,
    periodEnd,
    tdsPaise,
    payableNowPaise: payableNowPaise({ totalPaise: totals.totalPaise, taxableValuePaise: totals.taxableValuePaise, tdsDeclared: input.tdsDeclared }),
  }
}

/** The due date: `days` after today (IST), 1–60. */
export const dueDateFrom = (today: string, days: number): string => addDays(today, Math.min(MAX_DUE_DAYS, Math.max(1, Math.round(days))))
