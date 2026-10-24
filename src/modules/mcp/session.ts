import 'server-only'
import { Types } from 'mongoose'
import type { SessionRecord } from '@/lib/auth/session'
import { buildCtx, type Ctx } from '@/lib/ctx'
import { dbConnect } from '@/lib/db'
import { Member } from '@/models/Member'
import { McpSettings } from '@/models/mcp/McpSettings'
import { OAuthGrant } from '@/models/mcp/OAuthGrant'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { User } from '@/models/User'
import { planConfig } from '@/modules/console/settings-query'
import { mcpRefusal, viaName } from './access'
import type { GrantRecord } from './oauth/core'
import type { McpScope } from './scopes'

/**
 * The member context an MCP call runs in: the grant's person in the grant's
 * workspace, with their current role (lib/ctx buildCtx, exactly as a page
 * request), shown in audit and notifications as "<name> via <app>".
 */

export type McpSession = Readonly<{
  ctx: Ctx
  grantId: string
  clientName: string
  /** Scopes on the token. Each tool also re-checks the role (ctx.can). */
  scopes: readonly McpScope[]
  personName: string
}>

/** True unless an admin switched AI apps off for the workspace. */
export async function mcpEnabledFor(orgId: Types.ObjectId | string): Promise<boolean> {
  await dbConnect()
  const row = await McpSettings.findOne({ orgId: new Types.ObjectId(String(orgId)) }, { enabled: 1 }).lean()
  return row?.enabled !== false
}

type Who = { userId: string; orgId: string; memberId: string }

async function loadWho(who: Who) {
  await dbConnect()
  const orgId = new Types.ObjectId(who.orgId)
  const [org, member, user, customRoles, config, enabled] = await Promise.all([
    Org.findById(orgId).lean(),
    Member.findOne({ _id: new Types.ObjectId(who.memberId), orgId, userId: new Types.ObjectId(who.userId), status: 'active' }).lean(),
    User.findById(new Types.ObjectId(who.userId)).lean(),
    Role.find({ orgId, builtIn: false }).lean(),
    planConfig(),
    mcpEnabledFor(orgId),
  ])
  return { org, member, user, customRoles, config, enabled }
}

export type SessionResult = Readonly<{ ok: true; session: McpSession } | { ok: false; reason: string }>

/** Builds the session for a verified grant, or says why the person or workspace can no longer use it. */
export async function sessionForGrant(grant: GrantRecord): Promise<SessionResult> {
  const { org, member, user, customRoles, config, enabled } = await loadWho(grant)
  if (!org || org.deletedAt || !member || !user) return { ok: false, reason: 'You are no longer a member of this workspace. Connect again.' }
  const stand = { _id: new Types.ObjectId(), userId: user._id, tokenHash: '', expiresAt: grant.accessExpiresAt, activeOrgId: org._id } as unknown as SessionRecord
  const personName = user.name
  const ctx = buildCtx({ ...user, name: viaName(user.name, grant.clientName) }, stand, org, member, customRoles, config)
  const refusal = mcpRefusal(ctx.entitlements, enabled, ctx.twoFactorMissing)
  if (refusal) return { ok: false, reason: refusal }
  return { ok: true, session: { ctx, grantId: grant.id, clientName: grant.clientName, scopes: grant.scopes, personName } }
}

/** Token-time re-check (code exchange and refresh): still an active member of a workspace that may use MCP. */
export async function stillAllowed(who: Who): Promise<string | null> {
  const { org, member, user, customRoles, config, enabled } = await loadWho(who)
  if (!org || org.deletedAt || !member || !user) return 'You are no longer a member of this workspace.'
  const stand = { _id: new Types.ObjectId(), userId: user._id, tokenHash: '', expiresAt: new Date(), activeOrgId: org._id } as unknown as SessionRecord
  const ctx = buildCtx(user, stand, org, member, customRoles, config)
  return mcpRefusal(ctx.entitlements, enabled, ctx.twoFactorMissing)
}

/** Records "last used" at most once a minute per connection. */
export async function touchGrant(grantId: string): Promise<void> {
  const now = new Date()
  await OAuthGrant.updateOne({ _id: new Types.ObjectId(grantId), $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: new Date(now.getTime() - 60_000) } }] }, { $set: { lastUsedAt: now } }).catch((error: unknown) => console.warn('[mcp] could not record last use', error))
}
