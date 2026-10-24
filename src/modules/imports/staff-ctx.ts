import 'server-only'
import { Types } from 'mongoose'
import type { SessionRecord } from '@/lib/auth/session'
import { buildCtx, type Ctx } from '@/lib/ctx'
import { NotFoundError, UserError } from '@/lib/errors'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { User } from '@/models/User'
import { planConfig } from '@/modules/console/settings-query'

/**
 * The workspace context a staff-run import works in (console spec 9): the
 * owner's permissions and seat limits, with the actor shown as "Flowbit team
 * (Name)" in the workspace's audit log. Only built after the consent gate
 * (lib/console/support-access staffImportRefusal) passed.
 */
export async function staffWorkspaceCtx(orgId: Types.ObjectId | string, staffName: string): Promise<Ctx> {
  const org = await Org.findById(orgId).lean()
  if (!org || org.deletedAt) throw new NotFoundError('That workspace')
  const member = await Member.findOne({ orgId: org._id, role: 'owner', status: 'active' }).lean()
  if (!member) throw new UserError('This workspace has no active owner, so nobody can approve a staff import.')
  const [owner, customRoles, config] = await Promise.all([User.findById(member.userId).lean(), Role.find({ orgId: org._id, builtIn: false }).lean(), planConfig()])
  if (!owner) throw new NotFoundError('The workspace owner')
  const user = { ...owner, name: `Flowbit team (${staffName})` }
  // No browser session exists for a staff import; this stand-in is never stored or used as a cookie.
  const session = { _id: new Types.ObjectId(), userId: owner._id, tokenHash: '', expiresAt: new Date(), activeOrgId: org._id } as unknown as SessionRecord
  return buildCtx(user, session, org, member, customRoles, config)
}
