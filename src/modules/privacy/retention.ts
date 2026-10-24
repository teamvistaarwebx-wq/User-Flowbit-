import { LOG_RETENTION_DAYS } from '@/lib/lifecycle'
import { liveJobEnabled } from '@/lib/live-jobs'

/**
 * Retention of message and processing logs (DPDP, notifications-v2 §0b.9:
 * "message logs kept at least 1 year"). Rows older than RETENTION_DAYS are
 * deleted by the daily lifecycle job, in batches. Like workspace deletion it
 * runs on deployed production servers and is a dry run elsewhere
 * (lib/live-jobs liveJobEnabled); RETENTION_PRUNE_ENABLED=false is
 * the kill switch. Pure: the store is injected.
 *
 * Not pruned: audit logs (security records), Flowbit's invoices and billing
 * events (tax law), document timelines (part of the documents) and usage
 * events (their own 400-day TTL).
 */

/** 13 months: at least a year, with a month's margin so a year-on-year comparison always has its data (lib/lifecycle LOG_RETENTION_DAYS). */
export const RETENTION_DAYS = LOG_RETENTION_DAYS
const DAY_MS = 86_400_000

export const RETENTION_TARGETS = [
  { name: 'Message', field: 'createdAt', what: 'message and delivery log' },
  { name: 'Outbox', field: 'createdAt', what: 'old email queue' },
  { name: 'FolioMessage', field: 'createdAt', what: 'Folio message log' },
  { name: 'AutomationRun', field: 'createdAt', what: 'automation run history' },
  { name: 'WaThreadMessage', field: 'at', what: 'workspace WhatsApp chat messages' },
  { name: 'WaChatMessage', field: 'at', what: "Flowbit's own WhatsApp inbox messages" },
  { name: 'PaymentEvent', field: 'createdAt', what: 'payment webhook processing log' },
] as const
export type RetentionTarget = (typeof RETENTION_TARGETS)[number]['name']

/** On by default on a deployed production server; dry run locally, in dev and on previews; RETENTION_PRUNE_ENABLED=false turns it off (D4). */
export const retentionEnabled = (env: Readonly<Record<string, string | undefined>> = process.env): boolean => liveJobEnabled(env, 'RETENTION_PRUNE_ENABLED')

export const retentionCutoff = (now: Date): Date => new Date(now.getTime() - RETENTION_DAYS * DAY_MS)

export type RetentionStore = Readonly<{
  /** Rows older than `before`. */
  count: (target: RetentionTarget, before: Date) => Promise<number>
  /** Deletes up to `limit` rows older than `before`; returns how many went. */
  deleteBatch: (target: RetentionTarget, before: Date, limit: number) => Promise<number>
}>

export type RetentionLine = Readonly<{ target: RetentionTarget; due: number; deleted: number }>
export type RetentionReport = Readonly<{ apply: boolean; cutoff: string; lines: RetentionLine[] }>

/** Rows deleted per batch, and batches per collection per run (the rest go the next day). */
export const RETENTION_BATCH = 2_000
export const RETENTION_MAX_BATCHES = 25

export async function runRetention(store: RetentionStore, opts: { apply: boolean; now: Date; batch?: number; maxBatches?: number }): Promise<RetentionReport> {
  const cutoff = retentionCutoff(opts.now)
  const batch = opts.batch ?? RETENTION_BATCH
  const maxBatches = opts.maxBatches ?? RETENTION_MAX_BATCHES
  const lines: RetentionLine[] = []
  for (const { name } of RETENTION_TARGETS) {
    const due = await store.count(name, cutoff)
    let deleted = 0
    if (opts.apply) {
      for (let i = 0; i < maxBatches && deleted < due; i += 1) {
        const n = await store.deleteBatch(name, cutoff, batch)
        deleted += n
        if (n < batch) break
      }
    }
    lines.push({ target: name, due, deleted })
  }
  return { apply: opts.apply, cutoff: cutoff.toISOString(), lines }
}

/** One log line for the cron output. */
export function retentionSummary(report: RetentionReport): string {
  const parts = report.lines.filter((l) => l.due).map((l) => `${l.target} ${report.apply ? `${l.deleted}/${l.due}` : l.due}`)
  if (!parts.length) return `[retention] nothing older than ${report.cutoff.slice(0, 10)}`
  return report.apply ? `[retention] deleted rows older than ${report.cutoff.slice(0, 10)}: ${parts.join(', ')}` : `[retention] would delete rows older than ${report.cutoff.slice(0, 10)}: ${parts.join(', ')} (dry run: not a deployed production server, or RETENTION_PRUNE_ENABLED=false)`
}
