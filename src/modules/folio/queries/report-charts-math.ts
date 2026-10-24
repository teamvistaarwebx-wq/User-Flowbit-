import { addDays } from '@/lib/dates'
import { AGING_BUCKETS, summariseAging, type AgingBucket, type AgingInput } from '@/modules/folio/engine/aging'

/**
 * Pure maths behind the charts on Folio → Reports (tested). Money is paise; dates 'YYYY-MM-DD'.
 */

export const CHART_MONTHS = 12
export const TOP_CLIENTS = 10

export type AgingSlice = { bucket: AgingBucket; paise: number; count: number }

/** Balance and invoice count per aging bucket (Not due, 1–30, 31–60, 61–90, 90+), in bucket order. */
export function agingSlices(rows: readonly (AgingInput & { bucket: AgingBucket })[], asOf: string): AgingSlice[] {
  const summary = summariseAging(rows, asOf)
  return AGING_BUCKETS.map((bucket) => ({ bucket, paise: summary[bucket], count: rows.filter((r) => r.bucket === bucket && r.balancePaise > 0).length }))
}

/**
 * Due-date range of the open invoices in a bucket, for the invoice list filter (?aging=31_60).
 * Days overdue = today − due date, so "31–60 days" is a due date from today−60 to today−31.
 */
export function agingDueRange(bucket: AgingBucket, today: string): { from?: string; to?: string } {
  switch (bucket) {
    case 'current':
      return { from: today }
    case '1_30':
      return { from: addDays(today, -30), to: addDays(today, -1) }
    case '31_60':
      return { from: addDays(today, -60), to: addDays(today, -31) }
    case '61_90':
      return { from: addDays(today, -90), to: addDays(today, -61) }
    default:
      return { to: addDays(today, -91) }
  }
}

export type MonthPair = { month: string; invoicedPaise: number; collectedPaise: number }

/** One row per month (oldest first), zero where nothing was invoiced or collected. */
export function monthlyPairs(months: readonly string[], invoiced: readonly { _id: string; n: number }[], collected: readonly { _id: string; n: number }[]): MonthPair[] {
  const inv = new Map(invoiced.map((r) => [r._id, r.n]))
  const col = new Map(collected.map((r) => [r._id, r.n]))
  return months.map((month) => ({ month, invoicedPaise: inv.get(month) ?? 0, collectedPaise: col.get(month) ?? 0 }))
}

/** `reverseCharge`: the recipient pays this tax, so it is not output tax of the supplier. */
export type TaxRow = { month: string; rate: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; reverseCharge?: boolean }
export type GstRateRow = Omit<TaxRow, 'month'> & { taxPaise: number }
export type GstMonthRow = { month: string; cgstPaise: number; sgstPaise: number; igstPaise: number; taxPaise: number }
export type GstSummary = {
  byRate: GstRateRow[]
  byMonth: GstMonthRow[]
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; taxPaise: number }
  /** Reverse-charge supplies, kept out of output tax: their GST is paid by the recipients. */
  reverseCharge: { taxablePaise: number; taxPaise: number }
}

const ZERO = { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }
const add = <T extends typeof ZERO>(a: T, b: typeof ZERO, sign: 1 | -1): T => ({ ...a, taxablePaise: a.taxablePaise + sign * b.taxablePaise, cgstPaise: a.cgstPaise + sign * b.cgstPaise, sgstPaise: a.sgstPaise + sign * b.sgstPaise, igstPaise: a.igstPaise + sign * b.igstPaise })
const taxOf = (r: typeof ZERO) => r.cgstPaise + r.sgstPaise + r.igstPaise

/** Output tax by rate and by month: invoice lines less credit-note lines (credit notes reduce the tax of their month). Reverse-charge rows are totalled apart. */
export function gstSummary(invoices: readonly TaxRow[], credits: readonly TaxRow[], months: readonly string[]): GstSummary {
  const all = [...invoices.map((r) => ({ r, sign: 1 as const })), ...credits.map((r) => ({ r, sign: -1 as const }))]
  const signed = all.filter((s) => !s.r.reverseCharge)
  const rcm = all.filter((s) => s.r.reverseCharge).reduce((acc, s) => add(acc, s.r, s.sign), { ...ZERO })
  const rates = [...new Set(signed.map((s) => s.r.rate))].sort((a, b) => a - b)
  const byRate = rates.map((rate) => {
    const sum = signed.filter((s) => s.r.rate === rate).reduce((acc, s) => add(acc, s.r, s.sign), { ...ZERO })
    return { rate, ...sum, taxPaise: taxOf(sum) }
  })
  const byMonth = months.map((month) => {
    const sum = signed.filter((s) => s.r.month === month).reduce((acc, s) => add(acc, s.r, s.sign), { ...ZERO })
    return { month, cgstPaise: sum.cgstPaise, sgstPaise: sum.sgstPaise, igstPaise: sum.igstPaise, taxPaise: taxOf(sum) }
  })
  const total = byRate.reduce((acc, r) => add(acc, r, 1), { ...ZERO })
  return { byRate, byMonth, totals: { ...total, taxPaise: taxOf(total) }, reverseCharge: { taxablePaise: rcm.taxablePaise, taxPaise: taxOf(rcm) } }
}

/** 'YYYY-MM' from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  const [fy, fm] = from.slice(0, 7).split('-').map(Number)
  const last = to.slice(0, 7)
  for (let i = 0; ; i += 1) {
    const d = new Date(Date.UTC(fy, fm - 1 + i, 1))
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    if (m > last) return out
    out.push(m)
  }
}
