import { formatDate, monthOf, monthRange, shiftMonth } from '@/lib/dates'
import { financialYearOf, financialYearRange } from './numbering'

/**
 * Reporting windows in plain words (pure, client-safe). Every Folio total
 * that depends on a range resolves one of these from the URL
 * (?period=this_month|last_month|this_fy|last_fy|custom&from&to) and prints
 * its window next to the number.
 */

export const PERIOD_KEYS = ['this_month', 'last_month', 'this_fy', 'last_fy', 'custom'] as const
export type PeriodKey = (typeof PERIOD_KEYS)[number] | 'all'

export const PERIOD_LABELS: Record<PeriodKey, string> = { this_month: 'This month', last_month: 'Last month', this_fy: 'This FY', last_fy: 'Last FY', custom: 'Custom', all: 'All time' }

export type Period = {
  key: PeriodKey
  /** Inclusive 'YYYY-MM-DD' bounds; null only for 'all'. */
  from: string | null
  to: string | null
  /** Phrase that follows a verb: "this month", "in FY 2026-27", "1 Sep – 2 Oct 2026". */
  noun: string
  /** The dates in words: "1–31 Oct 2026", "from 1 Apr 2026". */
  window: string
}

export type BoundedPeriod = Period & { from: string; to: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isIso = (v: string | undefined | null): v is string => Boolean(v && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)))

/** "1–31 Oct 2026", "1 Sep – 2 Oct 2026", "1 Apr 2026 – 31 Mar 2027"; one day reads "2 Oct 2026". */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return formatDate(from)
  const [fy, fm] = [from.slice(0, 4), from.slice(5, 7)]
  const [ty, tm] = [to.slice(0, 4), to.slice(5, 7)]
  if (fy === ty && fm === tm) return `${Number(from.slice(8, 10))}–${formatDate(to)}`
  if (fy === ty) return `${formatDate(from, { short: true })} – ${formatDate(to)}`
  return `${formatDate(from)} – ${formatDate(to)}`
}

/** '2026-27' -> '2025-26'. */
const fyBefore = (fy: string) => financialYearOf(`${Number(fy.slice(0, 4)) - 1}-06-01`)

/** "As of 2 Oct 2026" — for balances that are a snapshot, not a range. */
export const asOfLabel = (today: string) => `as of ${formatDate(today)}`

function monthPeriod(key: 'this_month' | 'last_month', month: string): BoundedPeriod {
  const { start, end } = monthRange(month)
  return { key, from: start, to: end, noun: key === 'this_month' ? 'this month' : 'last month', window: rangeLabel(start, end) }
}

function fyPeriod(key: 'this_fy' | 'last_fy', fy: string): BoundedPeriod {
  const { start, end } = financialYearRange(fy)
  return { key, from: start, to: end, noun: `in FY ${fy}`, window: key === 'this_fy' ? `from ${formatDate(start)}` : rangeLabel(start, end) }
}

function customPeriod(fromRaw: string | undefined, toRaw: string | undefined, today: string): BoundedPeriod {
  let from = isIso(fromRaw) ? fromRaw : isIso(toRaw) ? toRaw : today
  let to = isIso(toRaw) ? toRaw : from > today ? from : today
  if (from > to) [from, to] = [to, from]
  const label = rangeLabel(from, to)
  return { key: 'custom', from, to, noun: label, window: label }
}

export type PeriodInput = { period?: string | null; from?: string | null; to?: string | null }

/**
 * The window a page shows. A known preset wins; 'custom' (or from/to with no
 * preset, for old links) reads the dates; anything else falls back.
 */
export function resolvePeriod(input: PeriodInput, today: string, fallback: PeriodKey = 'this_month'): Period {
  const key = input.period ?? ''
  const month = monthOf(today)
  const fy = financialYearOf(today)
  const pick = (k: string): Period | null => {
    if (k === 'this_month') return monthPeriod('this_month', month)
    if (k === 'last_month') return monthPeriod('last_month', shiftMonth(month, -1))
    if (k === 'this_fy') return fyPeriod('this_fy', fy)
    if (k === 'last_fy') return fyPeriod('last_fy', fyBefore(fy))
    if (k === 'all') return { key: 'all', from: null, to: null, noun: 'to date', window: 'all dates' }
    return null
  }
  const preset = pick(key)
  if (preset && (key !== 'all' || fallback === 'all')) return preset
  if (key === 'custom' || isIso(input.from) || isIso(input.to)) return customPeriod(input.from ?? undefined, input.to ?? undefined, today)
  return pick(fallback) ?? monthPeriod('this_month', month)
}

/** A period that must have bounds (dashboards, P&L): 'all' falls back to this FY. */
export function resolveBoundedPeriod(input: PeriodInput, today: string, fallback: Exclude<PeriodKey, 'all' | 'custom'> = 'this_month'): BoundedPeriod {
  const p = resolvePeriod(input, today, fallback)
  return p.from && p.to ? (p as BoundedPeriod) : fyPeriod('this_fy', financialYearOf(today))
}

/** The period before, for a "vs last" comparison: month → month before, FY → FY before; none for custom. */
export function previousPeriod(p: Period): { from: string; to: string; noun: string } | null {
  if (!p.from || !p.to) return null
  if (p.key === 'this_month' || p.key === 'last_month') {
    const { start, end } = monthRange(shiftMonth(monthOf(p.from), -1))
    return { from: start, to: end, noun: p.key === 'this_month' ? 'last month' : 'the month before' }
  }
  if (p.key === 'this_fy' || p.key === 'last_fy') {
    const prev = fyBefore(financialYearOf(p.from))
    const { start, end } = financialYearRange(prev)
    return { from: start, to: end, noun: `FY ${prev}` }
  }
  return null
}

/** Every 'YYYY-MM' the period touches, oldest first (at most 36). */
export function monthsIn(from: string, to: string, limit = 36): string[] {
  const out: string[] = []
  for (let m = monthOf(from); m <= monthOf(to) && out.length < limit; m = shiftMonth(m, 1)) out.push(m)
  return out
}

/** The period cut at the end of the current month, so month-by-month views skip months still to come. */
export function throughThisMonth(p: { from: string; to: string }, today: string): { from: string; to: string } {
  const end = monthRange(monthOf(today)).end
  const to = p.to > end ? end : p.to
  return { from: p.from > to ? to : p.from, to }
}
