/** Run history statuses (pure, client-safe). */

import { lifecycleOf, type LifecycleStage } from '@/lib/lifecycle'
import type { OrgLike } from '@/lib/plans'

export const RUN_STATUSES = ['scheduled', 'running', 'done', 'skipped', 'failed'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const STEP_STATUSES = ['sent', 'queued', 'created', 'notified', 'skipped', 'failed'] as const
export type StepStatus = (typeof STEP_STATUSES)[number]

export const RUN_STATUS_LABELS: Readonly<Record<RunStatus, string>> = { scheduled: 'Waiting', running: 'Running', done: 'Done', skipped: 'Skipped', failed: 'Failed' }

/** A run's outcome from its steps: failed if any failed, skipped if nothing went out, else done. */
export function runOutcome(steps: readonly { status: StepStatus }[]): RunStatus {
  if (steps.some((s) => s.status === 'failed')) return 'failed'
  if (steps.length === 0 || steps.every((s) => s.status === 'skipped')) return 'skipped'
  return 'done'
}

const INACTIVE: ReadonlySet<LifecycleStage> = new Set(['read_only', 'blocked', 'disabled', 'deleted'])

/**
 * Why a delayed run must not go out now, or null: a workspace that was
 * disabled, deleted, blocked or made read-only after the run was queued sends
 * nothing in its name (V2-REVIEW T1; time triggers already need full access).
 */
export function inactiveWorkspaceNote(org: OrgLike | null | undefined, now: Date = new Date()): string | null {
  if (!org) return 'The workspace no longer exists.'
  return INACTIVE.has(lifecycleOf(org, now).stage) ? 'The workspace is not active (read-only, blocked or disabled), so nothing was sent.' : null
}
