import { monthOf, monthRange, shiftMonth } from '@/lib/dates'
import { dueBillingDates, type RetainerFrequency } from '../engine/numbering'

/**
 * Expected billing (pure): what active retainers and pending billing-plan
 * milestones should bill over the coming months, before GST. Retainer dates
 * come from the same schedule the draft generator uses, counted after the
 * last *issued* invoice, so a draft waiting to be issued still shows as
 * expected. Anything already due but not issued lands in the current month.
 */

export type ForecastRetainer = {
  id: string
  name: string
  clientId: string
  entityId: string
  amountPaise: number
  gstRatePercent: number
  frequency: RetainerFrequency
  billingDay: number
  startDate: string
  endDate?: string | null
  resumeFrom?: string | null
  /** Billing dates of issued (not draft, not void) invoices. */
  issuedDates: string[]
}

export type ForecastMilestone = { id: string; label: string; clientId: string; entityId: string; amountPaise: number; gstRatePercent: number; dueOn: string | null }

export type ForecastLine = {
  kind: 'retainer' | 'milestone'
  sourceId: string
  label: string
  clientId: string
  entityId: string
  /** Billing date or milestone due date; null when a milestone has no date. */
  date: string | null
  month: string | null
  /** Due before this month and still not issued. */
  late: boolean
  amountPaise: number
  gstPaise: number
}

export type ForecastGroup = { id: string; perMonth: number[]; totalPaise: number }

export type Forecast = {
  months: string[]
  lines: ForecastLine[]
  /** Pending milestones with no due date: expected, but not in any month. */
  unscheduled: ForecastLine[]
  byMonth: { month: string; retainerPaise: number; milestonePaise: number; totalPaise: number; gstPaise: number }[]
  byFirm: ForecastGroup[]
  byClient: ForecastGroup[]
}

/** This month and the next `count - 1`, as 'YYYY-MM'. */
export const forecastMonths = (today: string, count: number): string[] => Array.from({ length: count }, (_, i) => shiftMonth(monthOf(today), i))

/** Unissued billing dates of one retainer up to the end of `lastMonth`. */
export function retainerDates(r: ForecastRetainer, lastMonth: string): string[] {
  const issued = new Set(r.issuedDates)
  const lastInvoicedOn = [...issued].sort().at(-1) ?? null
  const horizon = monthRange(lastMonth).end
  return dueBillingDates({ startDate: r.startDate, endDate: r.endDate, frequency: r.frequency, billingDay: r.billingDay, lastInvoicedOn }, horizon, 60).filter((d) => !issued.has(d) && (!r.resumeFrom || d >= r.resumeFrom))
}

const gstOn = (amountPaise: number, rate: number) => Math.round((amountPaise * rate) / 100)

function group(lines: ForecastLine[], months: string[], key: (l: ForecastLine) => string): ForecastGroup[] {
  const map = new Map<string, number[]>()
  for (const l of lines) {
    const idx = months.indexOf(l.month ?? '')
    if (idx < 0) continue
    const row = map.get(key(l)) ?? months.map(() => 0)
    map.set(key(l), row.map((v, i) => (i === idx ? v + l.amountPaise : v)))
  }
  return [...map.entries()].map(([id, perMonth]) => ({ id, perMonth, totalPaise: perMonth.reduce((s, v) => s + v, 0) })).sort((a, b) => b.totalPaise - a.totalPaise)
}

export function buildForecast(input: { today: string; months: number; retainers: ForecastRetainer[]; milestones: ForecastMilestone[] }): Forecast {
  const months = forecastMonths(input.today, Math.max(1, input.months))
  const first = months[0]
  const last = months[months.length - 1]
  const place = (date: string) => {
    const m = monthOf(date)
    return { month: m < first ? first : m, late: m < first }
  }
  const retainerLines: ForecastLine[] = input.retainers.flatMap((r) =>
    retainerDates(r, last).map((date) => ({ kind: 'retainer' as const, sourceId: r.id, label: r.name, clientId: r.clientId, entityId: r.entityId, date, ...place(date), amountPaise: r.amountPaise, gstPaise: gstOn(r.amountPaise, r.gstRatePercent) })),
  )
  const milestoneLines: ForecastLine[] = input.milestones.map((m) => ({
    kind: 'milestone' as const,
    sourceId: m.id,
    label: m.label,
    clientId: m.clientId,
    entityId: m.entityId,
    date: m.dueOn,
    ...(m.dueOn ? place(m.dueOn) : { month: null, late: false }),
    amountPaise: m.amountPaise,
    gstPaise: gstOn(m.amountPaise, m.gstRatePercent),
  }))
  const scheduled = [...retainerLines, ...milestoneLines.filter((l) => l.month && l.month <= last)].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const byMonth = months.map((month) => {
    const rows = scheduled.filter((l) => l.month === month)
    const sum = (kind?: ForecastLine['kind']) => rows.filter((l) => !kind || l.kind === kind).reduce((s, l) => s + l.amountPaise, 0)
    return { month, retainerPaise: sum('retainer'), milestonePaise: sum('milestone'), totalPaise: sum(), gstPaise: rows.reduce((s, l) => s + l.gstPaise, 0) }
  })
  return {
    months,
    lines: scheduled,
    unscheduled: milestoneLines.filter((l) => !l.month),
    byMonth,
    byFirm: group(scheduled, months, (l) => l.entityId),
    byClient: group(scheduled, months, (l) => l.clientId),
  }
}

/** Expected billing over the first `n` months of a forecast (before GST). */
export const forecastTotal = (f: Pick<Forecast, 'byMonth'>, n = f.byMonth.length): number => f.byMonth.slice(0, n).reduce((s, m) => s + m.totalPaise, 0)
