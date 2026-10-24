/**
 * The first-year discount on yearly plans (console spec 2): the first yearly
 * invoice a workspace pays gets `percent` off the yearly list price (10 x the
 * monthly price, lib/plans YEARLY_MONTHS). Later yearly renewals and every monthly invoice pay the list
 * price. The percentage is a Console setting (lib/plan-config), 50 by default;
 * 0 switches it off. Pure and client-safe. Money is integer paise.
 */

export const DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT = 50
export const MAX_FIRST_YEAR_DISCOUNT_PERCENT = 90
/** `productKey` of the discount line on bills and invoices. */
export const FIRST_YEAR_DISCOUNT_KEY = 'first_year_discount'

/** A whole percentage in 0–90; anything else means "no discount". */
export function cleanDiscountPercent(percent: number | null | undefined): number {
  if (typeof percent !== 'number' || !Number.isInteger(percent)) return 0
  return percent >= 0 && percent <= MAX_FIRST_YEAR_DISCOUNT_PERCENT ? percent : 0
}

/** The discount on a yearly list amount, rounded to the paisa. Never more than the amount. */
export function firstYearDiscountPaise(listPaise: number, percent: number): number {
  const pct = cleanDiscountPercent(percent)
  if (listPaise <= 0 || pct === 0) return 0
  return Math.min(listPaise, Math.round((listPaise * pct) / 100))
}

/** What an earlier invoice needs to show for the first-year rule. */
export type PastInvoice = Readonly<{
  status?: string | null
  kind?: string | null
  cycle?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  lines?: ReadonlyArray<{ productKey?: string | null }> | null
}>

/** A period this long or longer is a year (invoices issued before the cycle was stored on them). */
const YEARLY_PERIOD_MIN_DAYS = 300
const DAY_MS = 86_400_000

const periodDays = (start?: string | null, end?: string | null) =>
  start && end ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1 : 0

/** A paid plan invoice for a year (cancelled ones, due bills and upgrades do not count). */
export function isPaidYearlyInvoice(invoice: PastInvoice): boolean {
  if (invoice.status !== 'paid' || (invoice.kind ?? 'subscription') !== 'subscription') return false
  if (invoice.cycle) return invoice.cycle === 'yearly'
  if (invoice.lines?.some((l) => l.productKey === FIRST_YEAR_DISCOUNT_KEY)) return true
  return periodDays(invoice.periodStart, invoice.periodEnd) >= YEARLY_PERIOD_MIN_DAYS
}

/**
 * The discount percentage a new plan invoice gets: the Console percentage on a
 * yearly plan when the workspace has never paid for a year, else 0.
 */
export function firstYearDiscountPercent(input: { cycle: string; percent: number; past: ReadonlyArray<PastInvoice> }): number {
  if (input.cycle !== 'yearly') return 0
  if (input.past.some(isPaidYearlyInvoice)) return 0
  return cleanDiscountPercent(input.percent)
}

/** The discount line on a bill or invoice ("First-year discount on yearly plans (50%)"). */
export function discountLineDescription(percent: number): string {
  return `First-year discount on yearly plans (${cleanDiscountPercent(percent)}% off)`
}

/** The list (renewal) value of invoice lines: the taxable value before the first-year discount. */
export const listValueOf = (lines: ReadonlyArray<{ productKey?: string | null; amountPaise: number }>): number =>
  lines.filter((l) => l.productKey !== FIRST_YEAR_DISCOUNT_KEY).reduce((sum, l) => sum + l.amountPaise, 0)
