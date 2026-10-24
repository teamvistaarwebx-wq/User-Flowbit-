import type { UsageKind } from '@/lib/usage-kinds'

/**
 * The account timeline in the Console (spec 7.2): signup, product use,
 * plan changes, payments, messages and imports in one list, newest first.
 * Pure: the query (timeline-query) gathers the sources.
 */

export const TIMELINE_KINDS = ['signup', 'usage', 'plan', 'payment', 'message', 'import', 'console'] as const
export type TimelineKind = (typeof TIMELINE_KINDS)[number]
export type TimelineItem = { at: Date; kind: TimelineKind; title: string; detail?: string }

export const TIMELINE_LIMIT = 120

const USAGE_WORDS: Record<UsageKind, [string, string]> = {
  login: ['sign-in', 'sign-ins'],
  attendance_marked: ['attendance mark', 'attendance marks'],
  invoice_issued: ['invoice issued', 'invoices issued'],
  task_created: ['task created', 'tasks created'],
  task_moved: ['task moved', 'tasks moved'],
  lead_touched: ['lead touched', 'leads touched'],
  upgrade_clicked: ['Upgrade click', 'Upgrade clicks'],
  limit_hit: ['limit hit', 'limits hit'],
}

/** One line per IST day of product use: "14 tasks moved · 3 sign-ins". */
export function usageDigest(rows: readonly { day: string; kind: UsageKind; count: number }[]): TimelineItem[] {
  const byDay = new Map<string, Map<UsageKind, number>>()
  for (const r of rows) {
    const day = byDay.get(r.day) ?? new Map<UsageKind, number>()
    byDay.set(r.day, new Map([...day, [r.kind, (day.get(r.kind) ?? 0) + r.count]]))
  }
  return [...byDay.entries()].map(([day, kinds]) => ({
    // Noon IST, so the day sorts inside its own date among timestamped items.
    at: new Date(`${day}T06:30:00Z`),
    kind: 'usage' as const,
    title: [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${USAGE_WORDS[k][n === 1 ? 0 : 1]}`).join(' · '),
  }))
}

/** All sources merged, newest first, at most `limit` items. */
export function mergeTimeline(sources: readonly (readonly TimelineItem[])[], limit = TIMELINE_LIMIT): TimelineItem[] {
  return sources.flat().filter((i) => !Number.isNaN(i.at.getTime())).sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)
}
