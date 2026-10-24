import { addDays, daysInMonth, makeIsoDate, parseIsoDate, toIsoDate, type IsoDate } from './calendar'

/**
 * Document numbering and billing calendars (port of BillingOS
 * `lib/invoice/numbering.ts`). The financial year runs April to March and a
 * statutory series restarts with it.
 */

export type FyLabel = string
export type RetainerFrequency = 'monthly' | 'quarterly' | 'half_yearly' | 'annual'
export type SeriesKind = 'invoice' | 'credit_note' | 'receipt' | 'quote' | 'proforma'

const FY_START_MONTH = 4

/** `2026-08-14` -> `2026-27`. A date in Jan–Mar belongs to the year before. */
export function financialYearOf(date: IsoDate): FyLabel {
  const parsed = parseIsoDate(date)
  const year = parsed.getUTCFullYear()
  const startYear = parsed.getUTCMonth() + 1 >= FY_START_MONTH ? year : year - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** `2026-27` -> 1 Apr 2026 to 31 Mar 2027. Throws on a malformed label. */
export function financialYearRange(label: FyLabel): { start: IsoDate; end: IsoDate } {
  if (!/^\d{4}-\d{2}$/.test(label)) throw new Error(`Expected a financial year label like 2026-27, received "${label}"`)
  const startYear = Number.parseInt(label.slice(0, 4), 10)
  return { start: makeIsoDate(startYear, FY_START_MONTH, 1), end: makeIsoDate(startYear + 1, 3, 31) }
}

/**
 * How the year prints in a number: 'long' `2026-27` (the original format, kept
 * by series saved before the 16-character rule) or 'short' `26-27`.
 */
export const FY_FORMATS = ['long', 'short'] as const
export type FyFormat = (typeof FY_FORMATS)[number]

/** CGST Rule 46(b) and the IRP: a tax document number is at most 16 characters. */
export const MAX_DOCUMENT_NUMBER_LENGTH = 16

/** The kinds whose numbers are statutory GST documents (quotes and proformas are not). */
export const GST_NUMBERED_KINDS: readonly SeriesKind[] = ['invoice', 'credit_note', 'receipt']

/** `2026-27` -> `26-27` for the short format; the long format is the label itself. */
export const printedFyLabel = (fyLabel: FyLabel, format: FyFormat = 'long'): string => (format === 'short' ? fyLabel.slice(2) : fyLabel)

/** `VWX` + `2026-27` + 7 -> `VWX/2026-27/0007` (`VWX/26-27/0007` short). Never truncates a longer sequence. */
export function formatDocumentNumber(prefix: string, fyLabel: FyLabel, sequence: number, padding = 4, format: FyFormat = 'long'): string {
  return `${prefix}/${printedFyLabel(fyLabel, format)}/${String(sequence).padStart(padding, '0')}`
}

const SAMPLE_FY: FyLabel = '2026-27'

/** The length of a number in this series while the sequence still fits its padding. */
export const seriesNumberLength = (prefix: string, padding: number, format: FyFormat = 'long'): number => formatDocumentNumber(prefix, SAMPLE_FY, 1, padding, format).length

/** The longest prefix that keeps numbers within 16 characters. */
export const longestPrefix = (padding: number, format: FyFormat = 'long'): number => MAX_DOCUMENT_NUMBER_LENGTH - seriesNumberLength('', padding, format)

/** Plain-words problem with an issued number, or null when it fits the GST limit. */
export function documentNumberProblem(number: string): string | null {
  if (number.length <= MAX_DOCUMENT_NUMBER_LENGTH) return null
  return `${number} is ${number.length} characters, but GST allows at most ${MAX_DOCUMENT_NUMBER_LENGTH}. Shorten the prefix or use the short year (26-27) in Folio settings, Number series.`
}

/** The counter key for an entity's series of one kind in one FY. */
export const seriesKey = (kind: SeriesKind, entityId: string, fyLabel: FyLabel): string => `folio:${kind}:${entityId}:${fyLabel}`

export function dueDateFor(invoiceDate: IsoDate, paymentTermsDays: number): IsoDate {
  return addDays(invoiceDate, Math.max(0, Math.round(paymentTermsDays)))
}

const MONTHS_PER_PERIOD: Record<RetainerFrequency, number> = { monthly: 1, quarterly: 3, half_yearly: 6, annual: 12 }

export const monthsPerPeriod = (frequency: RetainerFrequency): number => MONTHS_PER_PERIOD[frequency]

function shiftMonths(date: IsoDate, months: number, billingDay: number): IsoDate {
  const parsed = parseIsoDate(date)
  const index = parsed.getUTCMonth() + months
  const year = parsed.getUTCFullYear() + Math.floor(index / 12)
  const month = (((index % 12) + 12) % 12) + 1
  return makeIsoDate(year, month, Math.min(billingDay, daysInMonth(year, month)))
}

/** One period on, the day clamped by `billingDay` (31 -> 28 Feb -> 31 Mar). */
export function addBillingPeriod(date: IsoDate, frequency: RetainerFrequency, billingDay: number): IsoDate {
  return shiftMonths(date, MONTHS_PER_PERIOD[frequency], billingDay)
}

/** The first billing date on or after the start date (no proration of a partial first period). */
export function firstBillingDate(startDate: IsoDate, frequency: RetainerFrequency, billingDay: number): IsoDate {
  const parsed = parseIsoDate(startDate)
  const year = parsed.getUTCFullYear()
  const month = parsed.getUTCMonth() + 1
  const candidate = makeIsoDate(year, month, Math.min(billingDay, daysInMonth(year, month)))
  return parseIsoDate(candidate) >= parsed ? candidate : addBillingPeriod(candidate, frequency, billingDay)
}

/** In advance: billing date to the day before the next one. In arrears: the period that just ended. */
export function servicePeriodFor(billingDate: IsoDate, frequency: RetainerFrequency, billingDay: number, billInAdvance: boolean): { start: IsoDate; end: IsoDate } {
  if (billInAdvance) return { start: billingDate, end: addDays(addBillingPeriod(billingDate, frequency, billingDay), -1) }
  return { start: shiftMonths(billingDate, -MONTHS_PER_PERIOD[frequency], billingDay), end: toIsoDate(new Date(parseIsoDate(billingDate).getTime() - 86_400_000)) }
}

export type BillingSchedule = { startDate: IsoDate; endDate?: IsoDate | null; frequency: RetainerFrequency; billingDay: number; lastInvoicedOn?: IsoDate | null }

/** Every billing date up to `asOf` (and the end date), at most `limit`, so a forgotten retainer catches up. */
export function dueBillingDates(retainer: BillingSchedule, asOf: IsoDate, limit = 24): IsoDate[] {
  const dates: IsoDate[] = []
  let cursor = retainer.lastInvoicedOn
    ? addBillingPeriod(retainer.lastInvoicedOn, retainer.frequency, retainer.billingDay)
    : firstBillingDate(retainer.startDate, retainer.frequency, retainer.billingDay)
  while (cursor <= asOf && dates.length < limit) {
    if (retainer.endDate && cursor > retainer.endDate) break
    dates.push(cursor)
    cursor = addBillingPeriod(cursor, retainer.frequency, retainer.billingDay)
  }
  return dates
}
