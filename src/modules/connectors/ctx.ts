import 'server-only'
import { Types } from 'mongoose'
import type { SessionRecord } from '@/lib/auth/session'
import { buildCtx, type Ctx } from '@/lib/ctx'
import { dbConnect } from '@/lib/db'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { User } from '@/models/User'
import { planConfig } from '@/modules/console/settings-query'
import { viaName } from '@/modules/mcp/access'

/**
 * The member context a connector acts in (Slack, inbound email, inbound
 * webhook): that person's role and workspace, exactly like a page request,
 * shown as "<name> via Slack" in audit, timelines and notifications. Null
 * when they are not an active member or the workspace is gone.
 */
export async function connectorCtx(orgId: Types.ObjectId | string, member: { memberId?: Types.ObjectId | string; userId?: Types.ObjectId | string; owner?: boolean }, via: string): Promise<Ctx | null> {
  await dbConnect()
  const org = await Org.findById(new Types.ObjectId(String(orgId))).lean()
  if (!org || org.deletedAt) return null
  const filter = member.owner ? { role: 'owner' } : member.memberId ? { _id: new Types.ObjectId(String(member.memberId)) } : { userId: new Types.ObjectId(String(member.userId)) }
  const row = await Member.findOne({ orgId: org._id, status: 'active', ...filter }).sort({ joinedAt: 1 }).lean()
  if (!row) return null
  const [user, customRoles, config] = await Promise.all([User.findById(row.userId).lean(), Role.find({ orgId: org._id, builtIn: false }).lean(), planConfig()])
  if (!user) return null
  // No browser session exists for a connector call; this stand-in is never stored or sent as a cookie.
  const session = { _id: new Types.ObjectId(), userId: user._id, tokenHash: '', expiresAt: new Date(), activeOrgId: org._id } as unknown as SessionRecord
  const ctx = buildCtx({ ...user, name: member.owner ? via : viaName(user.name, via) }, session, org, row, customRoles, config)
  // A person acting through Slack or email counts as signing in: an owner or admin the workspace requires 2FA from must set it up first.
  if (!member.owner && ctx.twoFactorMissing) return null
  return ctx
}
