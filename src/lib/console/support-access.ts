/**
 * Support access (console spec 8, 9): Flowbit staff see a workspace only after
 * its owner approves a request; access is read-only by default and ends on
 * its own. A staff-run import also needs the owner's DPA acceptance and a
 * 7-day import grant. Pure and client-safe.
 */

import type { StaffRole } from './roles'

export const SUPPORT_MODES = ['read', 'import'] as const
export type SupportMode = (typeof SUPPORT_MODES)[number]
export const SUPPORT_MODE_LABEL: Record<SupportMode, string> = { read: 'Read-only', import: 'Import only' }

/** How long an approved grant lasts. Read: what staff asked for (1–72 hours); import: 7 days. */
export const READ_HOURS_DEFAULT = 24
export const READ_HOURS_MAX = 72
export const IMPORT_DAYS = 7
const HOUR_MS = 3_600_000

/** The DPA version an owner accepts before staff touch data (bump it when /legal/dpa changes). */
export const DPA_VERSION = '2026-10-v2'
export const DPA_HREF = '/legal/dpa'

export type SupportStatus = 'requested' | 'active' | 'expired' | 'denied' | 'revoked'

export type SupportGrant = {
  mode: SupportMode
  status: 'requested' | 'approved' | 'denied' | 'revoked'
  hours: number
  approvedAt?: Date | string | null
  expiresAt?: Date | string | null
}

const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : null)

/** The grant's state at `now`: an approved grant past its end is expired. */
export function supportStatus(grant: SupportGrant, now: Date = new Date()): SupportStatus {
  if (grant.status !== 'approved') return grant.status
  const ends = time(grant.expiresAt)
  return ends != null && ends > now.getTime() ? 'active' : 'expired'
}

/** Hours a new grant of this mode lasts, clamped to the allowed range. */
export function grantHours(mode: SupportMode, requestedHours?: number | null): number {
  if (mode === 'import') return IMPORT_DAYS * 24
  const hours = Math.round(requestedHours ?? READ_HOURS_DEFAULT)
  return Math.min(READ_HOURS_MAX, Math.max(1, hours))
}

/** When a grant approved at `approvedAt` ends. */
export const grantEndsAt = (grant: Pick<SupportGrant, 'mode' | 'hours'>, approvedAt: Date) => new Date(approvedAt.getTime() + grantHours(grant.mode, grant.hours) * HOUR_MS)

/** The active grant of a mode, or null. Import-only access does not open the read-only support view. */
export function activeGrant<G extends SupportGrant>(grants: readonly G[], mode: SupportMode, now: Date = new Date()): G | null {
  return grants.filter((g) => g.mode === mode && supportStatus(g, now) === 'active').sort((a, b) => (time(b.expiresAt) ?? 0) - (time(a.expiresAt) ?? 0))[0] ?? null
}

export type DpaAcceptance = { version?: string | null; acceptedAt?: Date | string | null } | null | undefined

/** The owner accepted the current DPA. */
export const dpaAccepted = (dpa: DpaAcceptance) => Boolean(dpa?.acceptedAt && dpa.version === DPA_VERSION)

/**
 * Why staff may not run an import in this workspace now, or null (spec 9):
 * the owner must have accepted the current DPA and approved import access
 * that has not ended.
 */
export function staffImportRefusal(input: { dpa: DpaAcceptance; grants: readonly SupportGrant[]; now?: Date }): string | null {
  if (!dpaAccepted(input.dpa)) return 'The owner has not accepted the data processing agreement yet. Ask them to accept it in Settings → Support access.'
  if (!activeGrant(input.grants, 'import', input.now)) return 'There is no approved import access. Request 7 days of import-only access and ask the owner to approve it.'
  return null
}

/** The grants made out to one staff member: an owner approves a named person, not the whole team (V2-REVIEW C3). */
export const grantsFor = <G extends { staffId?: unknown }>(grants: readonly G[], staffId: unknown): G[] => grants.filter((g) => g.staffId != null && String(g.staffId) === String(staffId))

/** The Internal workspace is founder-only in the Console (V2-REVIEW C2). */
export const internalLocked = (accountType: string | null | undefined, isFounder: boolean) => accountType === 'internal' && !isFounder

/**
 * The workspace's own audit rows show in the Console only to an Admin holding
 * an active read grant (spec 8, V2-REVIEW C1), and even then with amounts, PANs
 * and account numbers masked (lib/console/mask maskSensitiveText, D3).
 */
export const showsWorkspaceAudit = (role: StaffRole, hasReadGrant: boolean) => role === 'admin' && hasReadGrant
