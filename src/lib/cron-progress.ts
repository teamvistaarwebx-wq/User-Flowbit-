/**
 * Where a cron job's run over all workspaces stands (pure, testable). A run
 * stops starting new workspaces once its time budget is spent, records the
 * last workspace it finished, and the catch-up delivery (`?resume=1` in
 * vercel.json) carries on from there the same day.
 */

/** Stop starting new workspaces after this long, leaving room under maxDuration (300 s) to finish the current one and reply. */
export const CRON_TIME_BUDGET_MS = 240_000

export type CronProgress = { runAsOf?: string | null; lastOrgId?: unknown; complete?: boolean | null }

/** True when today's run stopped early and has workspaces left. */
export const hasUnfinishedRun = (progress: CronProgress | null | undefined, asOf: string): boolean =>
  Boolean(progress && progress.runAsOf === asOf && progress.complete === false)

/**
 * The workspaces this run should visit, oldest id first: all of them, or,
 * when resuming today's unfinished run, only those after the last one done.
 */
export function orgsToVisit<T extends { _id: unknown }>(orgs: readonly T[], progress: CronProgress | null | undefined, asOf: string): T[] {
  const sorted = [...orgs].sort((a, b) => String(a._id).localeCompare(String(b._id)))
  if (!hasUnfinishedRun(progress, asOf) || !progress?.lastOrgId) return sorted
  const after = String(progress.lastOrgId)
  return sorted.filter((org) => String(org._id) > after)
}
