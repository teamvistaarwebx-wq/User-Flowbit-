import type { Types } from 'mongoose'
import { LOG_RETENTION_DAYS } from '@/lib/lifecycle'
import { liveJobEnabled } from '@/lib/live-jobs'
import type { Anonymise, PurgeAction, TenantCollection } from './registry'

/**
 * Deleting a workspace's data 90 days after it was blocked (console spec 4.3),
 * or 30 days after its owner deleted it (owner decision D4).
 * Every filter this module builds starts with the workspace's `orgId`, so no
 * other workspace is ever touched (purge.test.ts proves it on two workspaces).
 *
 * SAFETY: nothing is deleted unless the caller passes `apply: true`. The
 * lifecycle cron does that on a deployed production server (lib/live-jobs),
 * never locally, in dev or on a preview; LIFECYCLE_DELETE_ENABLED=false is the
 * emergency kill switch. A dry run counts what would go and changes nothing.
 */

export type PurgeFilter = Readonly<{ orgId: Types.ObjectId; createdAt?: Readonly<{ $lt: Date } | { $gte: Date }> }>

/** Storage behind the purge: MongoDB in production (purge-store.ts), memory in tests. */
export interface PurgeStore {
  count(collection: TenantCollection, filter: PurgeFilter): Promise<number>
  deleteMany(collection: TenantCollection, filter: PurgeFilter): Promise<number>
  /** Applies `anonymise` to the matching rows; returns how many changed. */
  anonymise(collection: TenantCollection, filter: PurgeFilter, change: Anonymise): Promise<number>
  /** Storage keys of the workspace's uploaded and generated files. */
  filePaths(orgId: Types.ObjectId): Promise<string[]>
  deleteFile(path: string): Promise<void>
  /** Leaves a tombstone Org: status 'deleted', deletedAt, no personal data. */
  tombstone(orgId: Types.ObjectId, now: Date): Promise<void>
}

export type PurgeLine = { name: string; action: PurgeAction; deleted: number; anonymised: number; kept: number }
export type PurgeReport = { orgId: string; apply: boolean; at: Date; collections: PurgeLine[]; files: number; tombstone: boolean }

export type PurgeOptions = { apply: boolean; now?: Date }

const DAY_MS = 86_400_000

/** On by default on a deployed production server; dry run locally, in dev and on previews; LIFECYCLE_DELETE_ENABLED=false turns it off (D4). */
export const deletionEnabled = (env: Readonly<Record<string, string | undefined>> = process.env): boolean => liveJobEnabled(env, 'LIFECYCLE_DELETE_ENABLED')

const NO_ANON: Anonymise = { set: {}, unset: [] }

async function purgeCollection(store: PurgeStore, c: TenantCollection, orgId: Types.ObjectId, apply: boolean, cutoff: Date): Promise<PurgeLine> {
  const all: PurgeFilter = { orgId }
  const line = { name: c.name, action: c.purge, deleted: 0, anonymised: 0, kept: 0 }
  switch (c.purge) {
    case 'delete':
      return { ...line, deleted: apply ? await store.deleteMany(c, all) : await store.count(c, all) }
    case 'keep':
      return { ...line, kept: await store.count(c, all) }
    case 'anonymise': {
      const change = c.anonymise ?? NO_ANON
      return { ...line, anonymised: apply ? await store.anonymise(c, all, change) : await store.count(c, all) }
    }
    case 'log': {
      const old: PurgeFilter = { orgId, createdAt: { $lt: cutoff } }
      const recent: PurgeFilter = { orgId, createdAt: { $gte: cutoff } }
      const change = c.anonymise ?? NO_ANON
      const deleted = apply ? await store.deleteMany(c, old) : await store.count(c, old)
      const anonymised = apply ? await store.anonymise(c, recent, change) : await store.count(c, recent)
      return { ...line, deleted, anonymised }
    }
  }
}

/**
 * Removes one workspace's data: files first (their rows say where the bytes
 * are), then every collection in `collections` by its purge action, then the
 * Org becomes a tombstone. With `apply: false` it only reports counts.
 */
export async function purgeWorkspace(store: PurgeStore, collections: readonly TenantCollection[], orgId: Types.ObjectId, opts: PurgeOptions): Promise<PurgeReport> {
  const apply = opts.apply === true
  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * DAY_MS)
  const paths = await store.filePaths(orgId)
  if (apply) {
    for (const path of paths) await store.deleteFile(path)
  }
  const lines: PurgeLine[] = []
  for (const c of collections) lines.push(await purgeCollection(store, c, orgId, apply, cutoff))
  if (apply) await store.tombstone(orgId, now)
  return { orgId: String(orgId), apply, at: now, collections: lines, files: paths.length, tombstone: apply }
}

/** One line for the server log: what was (or would be) deleted. */
export function purgeSummary(report: PurgeReport): string {
  const deleted = report.collections.reduce((sum, l) => sum + l.deleted, 0)
  const anonymised = report.collections.reduce((sum, l) => sum + l.anonymised, 0)
  const verb = report.apply ? 'deleted' : 'would delete'
  return `[lifecycle] ${report.orgId}: ${verb} ${deleted} rows and ${report.files} files, ${report.apply ? 'anonymised' : 'would anonymise'} ${anonymised} log rows${report.apply ? '; tombstone left' : ' (dry run: not a deployed production server, or LIFECYCLE_DELETE_ENABLED=false)'}`
}
