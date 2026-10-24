import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Model, Types } from 'mongoose'
import { scoped, type Scoped } from '@/lib/db/scoped'
import { getSession, getSessionRecord, setActiveOrg, type SessionRecord, type SessionUser } from '@/lib/auth/session'
import { ForbiddenError, ReadOnlyError } from '@/lib/errors'
import type { FeatureKey, Permission, ProductKey } from '@/lib/catalog'
import { resolvePermissions, roleLabel } from '@/lib/permissions'
import { canUseFeature, canUseProduct, entitlements, type Entitlements } from '@/lib/entitlements'
import { DEFAULT_PLAN_CONFIG, type PlanConfig } from '@/lib/plan-config'
import { mustEnrolTwoFactor } from '@/lib/auth/two-factor-core'
import type { AccessState } from '@/lib/plans'
import { Member } from '@/models/Member'
import { planConfig as loadPlanConfig } from '@/modules/console/settings-query'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'

async function loadOrg(orgId: Types.ObjectId) {
  return Org.findById(orgId).lean()
}
async function loadMember(orgId: Types.ObjectId, userId: Types.ObjectId) {
  return Member.findOne({ orgId, userId, status: 'active' }).lean()
}

export type OrgRecord = NonNullable<Awaited<ReturnType<typeof loadOrg>>>
export type MemberRecord = NonNullable<Awaited<ReturnType<typeof loadMember>>>

export type Ctx = {
  user: SessionUser
  session: SessionRecord
  org: OrgRecord
  member: MemberRecord
  userId: Types.ObjectId
  orgId: Types.ObjectId
  memberId: Types.ObjectId
  /** Built-in role key or custom role id. */
  role: string
  roleLabel: string
  permissions: ReadonlySet<Permission>
  /** Access, account type, products, features and seat limit (lib/entitlements), computed once per request. */
  entitlements: Entitlements
  /** Prices and limits from Console settings (lib/plan-config), read once per request. */
  planConfig: PlanConfig
  /** Same as entitlements.access. */
  access: AccessState
  readOnly: boolean
  isOwner: boolean
  /** An owner or admin of a workspace that requires two-factor sign-in, without it set up: only Settings → Security works. */
  twoFactorMissing: boolean
  /** Has the permission. */
  can: (perm: Permission) => boolean
  canAny: (...perms: Permission[]) => boolean
  /** Throws ForbiddenError (actions turn it into { ok: false }). */
  assert: (perm: Permission, message?: string) => void
  /** Product entitled AND enabled. */
  has: (product: ProductKey) => boolean
  /** Feature available (e.g. 'muster.payroll' needs Muster Business). */
  hasFeature: (feature: FeatureKey) => boolean
  assertProduct: (product: ProductKey) => void
  /** Throws ReadOnlyError when the trial/plan ended. */
  assertWritable: () => void
  /** Org-scoped model wrapper: orgId injected into every query and create. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: <M extends Model<any>>(model: M) => Scoped<M>
}

const loadCustomRoles = (orgId: Types.ObjectId) => Role.find({ orgId, builtIn: false }).lean()

type Workspace = { member: MemberRecord; org: OrgRecord; customRoles: Awaited<ReturnType<typeof loadCustomRoles>> }

/**
 * The user's active membership, workspace and custom roles in one org, read
 * together; null when not an active member or the workspace is soft-deleted.
 */
async function loadWorkspace(orgId: Types.ObjectId, userId: Types.ObjectId): Promise<Workspace | null> {
  const [member, org, customRoles] = await Promise.all([loadMember(orgId, userId), loadOrg(orgId), loadCustomRoles(orgId)])
  return member && org && !org.deletedAt ? { member, org, customRoles } : null
}

/**
 * When the session's workspace is not usable: the user's last, else their
 * oldest active membership. Soft-deleted workspaces (Org.deletedAt) are
 * skipped, as if the membership did not exist.
 */
async function pickMembership(user: SessionUser, session: SessionRecord): Promise<Workspace | null> {
  if (user.lastOrgId && String(user.lastOrgId) !== String(session.activeOrgId ?? '')) {
    const last = await loadWorkspace(user.lastOrgId, user._id)
    if (last) return last
  }
  const members = await Member.find({ userId: user._id, status: 'active' }).sort({ joinedAt: 1 }).lean()
  if (!members.length) return null
  const orgs = await Org.find({ _id: { $in: members.map((m) => m.orgId) }, deletedAt: null }).lean()
  const member = members.find((m) => orgs.some((o) => String(o._id) === String(m.orgId)))
  const org = member ? orgs.find((o) => String(o._id) === String(member.orgId)) : undefined
  return member && org ? { member, org, customRoles: await loadCustomRoles(org._id) } : null
}

export function buildCtx(user: SessionUser, session: SessionRecord, org: OrgRecord, member: MemberRecord, customRoles: { _id: unknown; key: string; label: string; permissions: string[] }[], config: PlanConfig = DEFAULT_PLAN_CONFIG): Ctx {
  const permissions = resolvePermissions(member.role, customRoles)
  const ent = entitlements(org, new Date(), undefined, config)
  const access = ent.access
  const can = (perm: Permission) => permissions.has(perm)
  const has = (product: ProductKey) => canUseProduct(ent, product)
  return {
    user,
    session,
    org,
    member,
    userId: user._id,
    orgId: org._id,
    memberId: member._id,
    role: member.role,
    roleLabel: roleLabel(member.role, customRoles),
    permissions,
    entitlements: ent,
    planConfig: config,
    access,
    readOnly: access !== 'full',
    isOwner: member.role === 'owner',
    twoFactorMissing: mustEnrolTwoFactor({ required: org.security?.requireTwoFactorAdmins, role: member.role, state: user.twoFactor }),
    can,
    canAny: (...perms) => perms.some(can),
    assert: (perm, message) => {
      if (!can(perm)) throw new ForbiddenError(message)
    },
    has,
    hasFeature: (feature) => canUseFeature(ent, feature),
    assertProduct: (product) => {
      if (!has(product)) throw new ForbiddenError('This product is not active on your workspace. An owner can turn it on in Settings → Modules.')
    },
    assertWritable: () => {
      if (ent.readOnly) throw new ReadOnlyError(ent.readOnlyMessage)
    },
    db: (model) => scoped(model, org._id),
  }
}

/** The member context for the signed-in user, or null (signed out / no workspace). Cached per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const record = await getSessionRecord()
  if (!record) return null
  // The session's workspace and the Console plan settings load alongside the user instead of after it.
  const configP = loadPlanConfig()
  configP.catch(() => {})
  const [current, active] = await Promise.all([getSession(), record.activeOrgId ? loadWorkspace(record.activeOrgId, record.userId) : null])
  if (!current) return null
  const picked = active ?? (await pickMembership(current.user, current.session))
  if (!picked) return null
  const { member, org, customRoles } = picked
  if (String(current.session.activeOrgId ?? '') !== String(org._id)) await setActiveOrg(org._id)
  return buildCtx(current.user, current.session, org, member, customRoles, await configP)
})

/**
 * Route handlers in a blocked workspace (platform-disabled or past the
 * read-only window) refuse everything except the subscription invoice PDF.
 */
export const blockedResponse = () =>
  Response.json({ error: 'This workspace is paused. An owner can restore access in Settings → Plan & billing.' }, { status: 403 })

/** True when the workspace is blocked (platform-disabled, deleted or past the read-only window). */
export const isBlocked = (ctx: Pick<Ctx, 'entitlements'> | null | undefined) => ctx?.entitlements.access === 'blocked'

/** Route handlers refuse a blocked workspace and an admin who must still set up two-factor sign-in. */
export const routeRefused = (ctx: Pick<Ctx, 'entitlements' | 'twoFactorMissing'> | null | undefined) => isBlocked(ctx) || Boolean(ctx?.twoFactorMissing)

export type RequireOptions = {
  /** Permission the page needs. */
  perm?: Permission
  /** Any one of these permissions. */
  anyPerm?: Permission[]
  /** Product that must be entitled and enabled. */
  product?: ProductKey
  /** Any one of these products (e.g. Clients: work, orbit or folio). */
  anyProduct?: ProductKey[]
  feature?: FeatureKey
  /** Let blocked workspaces through (Settings -> Plan & billing only). */
  allowBlocked?: boolean
  /** Open even when the workspace requires two-factor sign-in and this admin has not set it up (Settings → Security). */
  allowWithout2fa?: boolean
}

export const TWO_FACTOR_SETUP_PATH = '/app/settings/security?setup=2fa'

/**
 * The member context or a redirect: signed out -> /login, no workspace ->
 * /onboarding, missing product -> /app/locked, missing permission ->
 * /app/denied, blocked workspace -> /app/settings/subscription.
 */
export async function requireMember(opts: RequireOptions = {}): Promise<Ctx> {
  const current = await getSession()
  if (!current) redirect('/login')
  const ctx = await getCtx()
  if (!ctx) redirect('/onboarding')
  if (ctx.twoFactorMissing && !opts.allowWithout2fa) redirect(TWO_FACTOR_SETUP_PATH)
  if (isBlocked(ctx) && !opts.allowBlocked) redirect('/app/settings/subscription')
  if (opts.product && !ctx.has(opts.product)) redirect(`/app/locked?product=${opts.product}`)
  if (opts.anyProduct && !opts.anyProduct.some(ctx.has)) redirect(`/app/locked?product=${opts.anyProduct[0]}`)
  if (opts.feature && !ctx.hasFeature(opts.feature)) redirect(`/app/locked?feature=${encodeURIComponent(opts.feature)}`)
  if (opts.perm && !ctx.can(opts.perm)) redirect('/app/denied')
  if (opts.anyPerm && !ctx.canAny(...opts.anyPerm)) redirect('/app/denied')
  return ctx
}
