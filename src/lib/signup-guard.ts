import { z } from 'zod'

/**
 * One Free workspace per business (console spec 5.2), and one 15-day trial per
 * business (owner decision D5, 11 Oct 2026): per GSTIN, else PAN, else
 * verified owner email. Pure: builds the values and the Mongo filters;
 * lib/workspace and modules/lifecycle/plan-switch run the queries.
 */

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/

export type TaxIds = { gstin?: string; pan?: string }

/** The PAN inside a GSTIN (characters 3 to 12). */
export const panOfGstin = (gstin: string) => gstin.slice(2, 12)

/**
 * Onboarding's optional "GSTIN or PAN" field: blank -> {}, a GSTIN -> its
 * GSTIN and PAN, a PAN -> the PAN. Anything else is a field error.
 */
export const taxIdField = z
  .string()
  .optional()
  .transform((value, ctx): TaxIds => {
    const clean = (value ?? '').replace(/\s+/g, '').toUpperCase()
    if (!clean) return {}
    if (GSTIN_RE.test(clean)) return { gstin: clean, pan: panOfGstin(clean) }
    if (PAN_RE.test(clean)) return { pan: clean }
    ctx.addIssue({ code: 'custom', message: 'Enter a 15-character GSTIN or a 10-character PAN, or leave it blank' })
    return z.NEVER
  })

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Workspaces that make a new Free workspace a duplicate: any Free workspace
 * (running or ended, deleted or not) created by this verified user, or
 * carrying the same GSTIN or PAN (a stored PAN, or the PAN inside a stored GSTIN).
 */
export function freeDuplicateFilter(input: { userId: unknown } & TaxIds): Record<string, unknown> {
  return { 'subscription.accountType': 'free', 'subscription.plan': 'trial', $or: sameBusiness(input) }
}

/** The `$or` that finds workspaces of the same business: same signup user, GSTIN, or PAN (stored, or inside a stored GSTIN). */
function sameBusiness(input: { userId: unknown } & TaxIds): Record<string, unknown>[] {
  const pan = input.pan ?? (input.gstin ? panOfGstin(input.gstin) : undefined)
  const same: Record<string, unknown>[] = [{ createdBy: input.userId }]
  if (input.gstin) same.push({ gstin: input.gstin })
  if (pan) same.push({ pan }, { gstin: new RegExp(`^\\d{2}${escape(pan)}`) })
  return same
}

/**
 * Workspaces that used this business's one 15-day trial (D5): any workspace of
 * the same signup user, GSTIN or PAN whose trial ever started (a signup trial,
 * or "Start trial" from Free), deleted or not. `excludeOrgId` leaves out the
 * workspace asking.
 */
export function trialUsedFilter(input: { userId: unknown; excludeOrgId?: unknown } & TaxIds): Record<string, unknown> {
  return { 'subscription.trialStartedAt': { $ne: null }, $or: sameBusiness(input), ...(input.excludeOrgId ? { _id: { $ne: input.excludeOrgId } } : {}) }
}

/** Which identifier matched, for the refusal message. */
export function duplicateReason(existing: { createdBy?: unknown; gstin?: string | null; pan?: string | null }, input: { userId: unknown } & TaxIds): 'email' | 'gstin' | 'pan' {
  if (input.gstin && existing.gstin === input.gstin) return 'gstin'
  const pan = input.pan ?? (input.gstin ? panOfGstin(input.gstin) : undefined)
  if (pan && (existing.pan === pan || (existing.gstin && panOfGstin(existing.gstin) === pan))) return 'pan'
  return 'email'
}

const REASON_COPY = { email: 'your email', gstin: 'this GSTIN', pan: 'this PAN' } as const

/** Signup refusal when the business already had its trial (D5). */
export const trialUsedMessage = (reason: keyof typeof REASON_COPY, workspace: string) =>
  `${workspace} already had the 15-day trial for ${REASON_COPY[reason]}. Each business gets one trial. Choose a plan in ${workspace} (Settings → Plan & billing), or write to support@useflowbit.com to open another workspace.`

export const duplicateMessage = (reason: keyof typeof REASON_COPY, workspace: string) =>
  `${workspace} already uses the Free plan for ${REASON_COPY[reason]}. Each business gets one Free workspace. Choose more than 5 people to start a 15-day trial instead, or upgrade ${workspace}.`
