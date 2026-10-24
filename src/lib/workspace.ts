import type { Types } from 'mongoose'
import { builtInRoleDocs } from '@/lib/permissions'
import { newFreeSubscription, newSignupTrialSubscription, type NewSubscriptionLimits } from '@/lib/plans'
import { duplicateReason, freeDuplicateFilter, trialUsedFilter, type TaxIds } from '@/lib/signup-guard'
import type { SignupUtm } from '@/lib/utm'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { User } from '@/models/User'

/**
 * Creating a workspace: Org on the Free plan (6 months, 5 seats) or a 15-day
 * trial of every product, the owner Member and the built-in Role documents.
 * No server-only imports, so the seed script can use it too.
 */

export { TEAM_SIZES, TEAM_SIZE_VALUES } from '@/lib/account-types'
export const WORKSPACE_MODES = ['project', 'personal'] as const

export type CreateWorkspaceInput = {
  name: string
  slug: string
  teamSize: string
  mode: 'project' | 'personal'
  /** Normalized pricing-page pick (lib/plan-intent), kept for the subscription picker. */
  planIntent?: string | null
  /** Free (up to 5 people) or a 15-day trial; omitted = trial (seed, tests). */
  accountType?: 'free' | 'trial'
  /** Optional GSTIN / PAN from onboarding (lib/signup-guard). */
  taxIds?: TaxIds
  /** Console trial days, Free seats and months (lib/plan-config); the constants when omitted. */
  limits?: NewSubscriptionLimits
  /** First-touch campaign data (lib/utm), for Console reports. */
  signupUtm?: SignupUtm | null
}

export const RESERVED_SLUGS = new Set(['app', 'api', 'www', 'admin', 'platform', 'login', 'signup', 'flowbit', 'help', 'support', 'settings', 'onboarding', 'invite', 'pricing', 'c', 'static', 'assets', 'contact', 'legal', 'products'])

export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (RESERVED_SLUGS.has(slug)) return false
  return !(await Org.exists({ slug }))
}

/**
 * Whether the user is an active member of a workspace that is not deleted.
 * Same rule as ctx's pickMembership: /onboarding and sign-in use it, so a
 * deleted workspace never sends /app and /onboarding to each other.
 */
export async function hasLiveWorkspace(userId: Types.ObjectId): Promise<boolean> {
  const orgIds = await Member.distinct('orgId', { userId, status: 'active' })
  if (!orgIds.length) return false
  return Boolean(await Org.exists({ _id: { $in: orgIds }, deletedAt: null }))
}

/** Names of the (not deleted) workspaces where the user's access was turned off. */
export async function disabledWorkspaceNames(userId: Types.ObjectId): Promise<string[]> {
  const orgIds = await Member.distinct('orgId', { userId, status: 'disabled' })
  if (!orgIds.length) return []
  const orgs = await Org.find({ _id: { $in: orgIds }, deletedAt: null }, { name: 1 }).lean()
  return orgs.map((o) => o.name)
}

/** A free slug based on `base`: 'vistaar', then 'vistaar-2', 'vistaar-3'... */
export async function suggestSlug(base: string): Promise<string> {
  const root = base || 'workspace'
  for (let i = 1; i < 50; i += 1) {
    const candidate = i === 1 ? root : `${root}-${i}`
    if (await isSlugAvailable(candidate)) return candidate
  }
  return `${root}-${Date.now().toString(36)}`
}

/**
 * The Free workspace that makes a new Free one a duplicate (console spec 5.2),
 * with which identifier matched, or null when the user may start Free.
 */
export async function freeWorkspaceTaken(userId: Types.ObjectId, taxIds: TaxIds = {}): Promise<{ name: string; reason: 'email' | 'gstin' | 'pan' } | null> {
  const input = { userId, ...taxIds }
  const existing = await Org.findOne(freeDuplicateFilter(input), { name: 1, createdBy: 1, gstin: 1, pan: 1 }).lean()
  return existing ? { name: existing.name, reason: duplicateReason(existing, input) } : null
}

/**
 * The workspace that already used this business's one 15-day trial (D5), with
 * which identifier matched, or null when a new trial may start.
 */
export async function trialTakenByBusiness(userId: Types.ObjectId, taxIds: TaxIds = {}, excludeOrgId?: Types.ObjectId): Promise<{ name: string; reason: 'email' | 'gstin' | 'pan' } | null> {
  const input = { userId, ...taxIds }
  const existing = await Org.findOne(trialUsedFilter({ ...input, excludeOrgId }), { name: 1, createdBy: 1, gstin: 1, pan: 1 }).lean()
  return existing ? { name: existing.name, reason: duplicateReason(existing, input) } : null
}

export async function createWorkspace(ownerId: Types.ObjectId, input: CreateWorkspaceInput, now = new Date()) {
  const subscription = input.accountType === 'free' ? newFreeSubscription(now, input.limits) : newSignupTrialSubscription(now, input.limits)
  const org = await Org.create({
    name: input.name,
    slug: input.slug,
    teamSize: input.teamSize,
    mode: input.mode,
    ...(input.taxIds?.gstin ? { gstin: input.taxIds.gstin } : {}),
    ...(input.taxIds?.pan ? { pan: input.taxIds.pan } : {}),
    subscription,
    enabledProducts: ['work', 'muster', 'orbit', 'folio'],
    ...(input.planIntent ? { planIntent: input.planIntent } : {}),
    ...(input.signupUtm ? { signupUtm: input.signupUtm } : {}),
    createdBy: ownerId,
  })
  await Role.insertMany(builtInRoleDocs().map((r) => ({ ...r, orgId: org._id })))
  const member = await Member.create({ orgId: org._id, userId: ownerId, role: 'owner', status: 'active', joinedAt: now })
  await User.updateOne({ _id: ownerId }, { $set: { lastOrgId: org._id } })
  return { org: org.toObject(), member: member.toObject() }
}
