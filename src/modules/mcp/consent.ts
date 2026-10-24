import 'server-only'
import { Types } from 'mongoose'
import type { SessionRecord, SessionUser } from '@/lib/auth/session'
import { buildCtx, type Ctx } from '@/lib/ctx'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { planConfig } from '@/modules/console/settings-query'
import { mcpRefusal } from './access'
import { grantableScopes, type McpScope } from './scopes'
import { mcpEnabledFor } from './session'

/**
 * The consent screen's data: every workspace the signed-in person belongs to,
 * whether it may use AI apps, and the scopes their role there allows (the
 * request ∩ role). The code is issued for one workspace only.
 */

export type ConsentWorkspace = Readonly<{ orgId: string; name: string; role: string; refusal: string | null; scopes: McpScope[] }>

/** The person's ctx in one workspace (their role there), or null when not an active member. */
export async function ctxInWorkspace(user: SessionUser, session: SessionRecord, orgId: string): Promise<Ctx | null> {
  if (!Types.ObjectId.isValid(orgId)) return null
  const oid = new Types.ObjectId(orgId)
  const [org, member, customRoles, config] = await Promise.all([Org.findById(oid).lean(), Member.findOne({ orgId: oid, userId: user._id, status: 'active' }).lean(), Role.find({ orgId: oid, builtIn: false }).lean(), planConfig()])
  if (!org || org.deletedAt || !member) return null
  return buildCtx(user, session, org, member, customRoles, config)
}

export async function consentWorkspaces(user: SessionUser, session: SessionRecord, requested: readonly McpScope[]): Promise<ConsentWorkspace[]> {
  const members = await Member.find({ userId: user._id, status: 'active' }, { orgId: 1 }).lean()
  const out: ConsentWorkspace[] = []
  for (const m of members) {
    const ctx = await ctxInWorkspace(user, session, String(m.orgId))
    if (!ctx) continue
    const refusal = mcpRefusal(ctx.entitlements, await mcpEnabledFor(ctx.orgId), ctx.twoFactorMissing)
    out.push({ orgId: String(ctx.orgId), name: ctx.org.name, role: ctx.roleLabel, refusal, scopes: grantableScopes(requested, { permissions: ctx.permissions, products: ctx.entitlements.products }) })
  }
  return out.sort((a, b) => Number(Boolean(a.refusal)) - Number(Boolean(b.refusal)) || a.name.localeCompare(b.name))
}
