/**
 * Meetings AI retention (DPDP): recordings and transcripts are purged a set
 * number of days after the meeting (default 90, per workspace). The daily job
 * only reports what it would delete unless MEETINGS_PURGE is on. Pure.
 */

export const DEFAULT_RETENTION_DAYS = 90
export const MIN_RETENTION_DAYS = 7
export const MAX_RETENTION_DAYS = 3650
const DAY_MS = 86_400_000

export const retentionDaysOf = (org: { meetingsAi?: { retentionDays?: number | null } | null }): number => {
  const days = org.meetingsAi?.retentionDays
  return typeof days === 'number' && days >= MIN_RETENTION_DAYS && days <= MAX_RETENTION_DAYS ? days : DEFAULT_RETENTION_DAYS
}

/** Recordings of meetings that ended before this instant are due. */
export const purgeCutoff = (retentionDays: number, now: Date = new Date()): Date => new Date(now.getTime() - retentionDays * DAY_MS)

export const isPurgeLive = (flag: string | null | undefined): boolean => ['1', 'true', 'yes', 'on'].includes((flag ?? '').trim().toLowerCase())

export type PurgeReport = Readonly<{ dryRun: boolean; workspaces: number; meetings: number; recordings: number; transcripts: number }>
