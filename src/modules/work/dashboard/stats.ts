import { addDays, istInstant } from '@/lib/dates'

/**
 * Home stat cards (pure): current counts, 14-day sparklines and week-over-week
 * change. There is no status history, so past days are approximated from
 * startedAt / dueDate / completedAt (deterministic and good enough).
 */

/** `n`: how many tasks this row stands for (grouped rows from statGroupStage); 1 when absent. */
export type StatTask = { status: string; dueDate?: string | null; completedAt?: Date | string | null; startedAt?: Date | string | null; n?: number }

export const SPARK_DAYS = 14
const WEEK = 7

const time = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : null)
const weight = (t: StatTask) => t.n ?? 1

export type StatSeries = { inProgress: number[]; overdue: number[]; completed: number[] }

/** One point per day, oldest first, ending today (IST). */
export function dailySeries(tasks: StatTask[], today: string, days = SPARK_DAYS): StatSeries {
  const out: StatSeries = { inProgress: [], overdue: [], completed: [] }
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i)
    const start = istInstant(day).getTime()
    const end = istInstant(addDays(day, 1)).getTime()
    let inProgress = 0
    let overdue = 0
    let completed = 0
    for (const t of tasks) {
      const done = time(t.completedAt)
      const started = time(t.startedAt)
      if (done != null && done >= start && done < end) completed += weight(t)
      if (t.dueDate && t.dueDate < day && (done == null || done >= start)) overdue += weight(t)
      if (started != null && started < end && (done == null || done >= end)) inProgress += weight(t)
    }
    out.inProgress.push(inProgress)
    out.overdue.push(overdue)
    out.completed.push(completed)
  }
  return out
}

/** % change: round((now - then) / max(then, 1) × 100). */
export const percentChange = (now: number, then: number) => Math.round(((now - then) / Math.max(then, 1)) * 100)

/** Today's point vs the point 7 days earlier. */
export function snapshotDelta(series: number[]): number | null {
  if (series.length <= WEEK) return null
  return percentChange(series[series.length - 1], series[series.length - 1 - WEEK])
}

/** Last 7 days' total vs the 7 days before (for flows such as completions). */
export function rollingDelta(series: number[]): number | null {
  if (series.length < 2 * WEEK) return null
  const sum = (a: number[]) => a.reduce((s, n) => s + n, 0)
  return percentChange(sum(series.slice(-WEEK)), sum(series.slice(-2 * WEEK, -WEEK)))
}

/**
 * Current card values: in progress / in review now, overdue now, done in the
 * last 7 IST calendar days (today and the 6 before), the same window as the
 * sparkline and rollingDelta, so the number and its % pill agree.
 */
export function currentCounts(tasks: StatTask[], today: string) {
  const weekAgo = istInstant(addDays(today, -(WEEK - 1))).getTime()
  const count = (match: (t: StatTask) => unknown) => tasks.reduce((sum, t) => (match(t) ? sum + weight(t) : sum), 0)
  return {
    inProgress: count((t) => t.status === 'in_progress' || t.status === 'in_review'),
    overdue: count((t) => t.status !== 'done' && t.dueDate && t.dueDate < today),
    completed: count((t) => t.status === 'done' && (time(t.completedAt) ?? 0) >= weekAgo),
  }
}

/**
 * The stats above only compare a task's instants with the IST midnights from
 * the first sparkline day through tomorrow (`bounds`), and its due date with
 * the sparkline days. So tasks can be grouped in MongoDB by where their dates
 * fall (statGroupStage) and counted from a few hundred weighted rows, however
 * many tasks there are, with the same results.
 */
export type StatWindow = { first: string; today: string; bounds: Date[] }

export function statWindow(today: string, days = SPARK_DAYS): StatWindow {
  const first = addDays(today, -(days - 1))
  return { first, today, bounds: Array.from({ length: days + 1 }, (_, i) => istInstant(addDays(first, i))) }
}

/** An instant standing for a bucket index from statGroupStage: -1 is before the window, k is bounds[k] up to bounds[k + 1]. */
export function boundaryInstant(index: number | null | undefined, bounds: Date[]): Date | null {
  if (index == null) return null
  return index < 0 ? new Date(bounds[0].getTime() - 1) : bounds[index]
}

/** Bucket index of a date field (see boundaryInstant), null when the field is not a date. */
const bucketOf = (field: string, bounds: Date[]) => ({
  $cond: [
    { $eq: [{ $type: field }, 'date'] },
    { $switch: { branches: bounds.map((b, i) => ({ case: { $lt: [field, b] }, then: i - 1 })), default: bounds.length - 1 } },
    null,
  ],
})

/** `$group` stage: one row per (status, due bucket, completed bucket, started bucket) with its task count `n`. */
export function statGroupStage({ first, today, bounds }: StatWindow) {
  return {
    $group: {
      _id: {
        status: '$status',
        // Only "before day X" matters: dates before the window share the day before it, today and later share today.
        due: {
          $switch: {
            branches: [
              { case: { $or: [{ $ne: [{ $type: '$dueDate' }, 'string'] }, { $eq: ['$dueDate', ''] }] }, then: null },
              { case: { $lt: ['$dueDate', first] }, then: addDays(first, -1) },
              { case: { $gte: ['$dueDate', today] }, then: today },
            ],
            default: '$dueDate',
          },
        },
        done: bucketOf('$completedAt', bounds),
        started: bucketOf('$startedAt', bounds),
      },
      n: { $sum: 1 },
    },
  }
}

export type StatGroupRow = { _id: { status: string; due: string | null; done: number | null; started: number | null }; n: number }

/** Grouped rows back to weighted StatTasks for dailySeries and currentCounts. */
export function fromStatGroups(rows: StatGroupRow[], { bounds }: StatWindow): StatTask[] {
  return rows.map(({ _id, n }) => ({ status: _id.status, dueDate: _id.due, completedAt: boundaryInstant(_id.done, bounds), startedAt: boundaryInstant(_id.started, bounds), n }))
}
