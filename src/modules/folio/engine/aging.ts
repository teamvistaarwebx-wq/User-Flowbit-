/**
 * Aging, DSO and chase priority (folio.md 6.16, port of lib/ledger/aging.ts).
 * Pure: dates are 'YYYY-MM-DD' strings compared on UTC midnights.
 */

export const AGING_BUCKETS = ['current', '1_30', '31_60', '61_90', '90_plus'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'Not yet due',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_plus': 'Over 90 days',
}

export const AGING_TONES: Record<AgingBucket, 'success' | 'warning' | 'danger'> = {
  current: 'success',
  '1_30': 'warning',
  '31_60': 'warning',
  '61_90': 'danger',
  '90_plus': 'danger',
}

const DAY_MS = 86_400_000

const utcMidnight = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Whole days past due; negative means not yet due. */
export const daysOverdue = (dueDate: string, asOf: string): number => Math.round((utcMidnight(asOf) - utcMidnight(dueDate)) / DAY_MS)

export function bucketFor(days: number): AgingBucket {
  if (days <= 0) return 'current'
  if (days <= 30) return '1_30'
  if (days <= 60) return '31_60'
  if (days <= 90) return '61_90'
  return '90_plus'
}

export type AgingInput = { dueDate: string; balancePaise: number }
export type AgingSummary = Record<AgingBucket, number> & { total: number; overdue: number }

export const emptyAging = (): AgingSummary => ({ current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0, total: 0, overdue: 0 })

/** Balance per bucket; settled rows (balance <= 0) are skipped. */
export function summariseAging(rows: readonly AgingInput[], asOf: string): AgingSummary {
  return rows.reduce<AgingSummary>((acc, row) => {
    if (row.balancePaise <= 0) return acc
    const bucket = bucketFor(daysOverdue(row.dueDate, asOf))
    return {
      ...acc,
      [bucket]: acc[bucket] + row.balancePaise,
      total: acc.total + row.balancePaise,
      overdue: acc.overdue + (bucket === 'current' ? 0 : row.balancePaise),
    }
  }, emptyAging())
}

/** round(receivables / creditSales x periodDays), or null when nothing was sold. */
export function daysSalesOutstanding(receivablesPaise: number, creditSalesPaise: number, periodDays: number): number | null {
  if (creditSalesPaise <= 0) return null
  return Math.round((receivablesPaise / creditSalesPaise) * periodDays)
}

/** Oldest debt first, then the larger balance. Returns a sorted copy. */
export function collectionPriority<T extends AgingInput>(rows: readonly T[], asOf: string): T[] {
  return [...rows].sort((a, b) => daysOverdue(b.dueDate, asOf) - daysOverdue(a.dueDate, asOf) || b.balancePaise - a.balancePaise)
}

/** Sum of positive balances (an overpayment never reduces exposure). */
export const totalExposure = (rows: readonly { balancePaise: number }[]): number => rows.reduce((sum, r) => sum + Math.max(0, r.balancePaise), 0)
