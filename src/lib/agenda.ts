/**
 * Agenda grouping for phone views of calendars (task calendar, leave calendar, meetings week): the month or week
 * grid becomes a list of days, each with its items. Pure, so it is shared by server and client components.
 */

export type AgendaDay<T> = { date: string; items: T[] }

export type AgendaOptions = {
  /** Show exactly these days, in this order, including days with nothing on them (a week view). */
  days?: readonly string[]
  /** Otherwise only days that have items, limited to this inclusive 'YYYY-MM-DD' range. */
  from?: string
  to?: string
}

/**
 * Group items by the day `dateOf` returns ('YYYY-MM-DD'; items without a day are left out), sorted by day.
 * Items keep their input order inside a day, so sort them first if order matters (e.g. by start time).
 */
export function groupByDay<T>(items: readonly T[], dateOf: (item: T) => string | null | undefined, opts: AgendaOptions = {}): AgendaDay<T>[] {
  const byDay = new Map<string, T[]>()
  for (const item of items) {
    const date = dateOf(item)
    if (!date) continue
    byDay.set(date, [...(byDay.get(date) ?? []), item])
  }
  if (opts.days) return opts.days.map((date) => ({ date, items: byDay.get(date) ?? [] }))
  return [...byDay.entries()]
    .filter(([date]) => (!opts.from || date >= opts.from) && (!opts.to || date <= opts.to))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, list]) => ({ date, items: list }))
}
