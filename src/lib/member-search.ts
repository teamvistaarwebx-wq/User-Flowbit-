import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { Member } from '@/models/Member'
import { User } from '@/models/User'

/**
 * Users of this workspace's members whose name or email matches. Starts from
 * the org's Members (FOUNDATION §4), so other tenants' users never crowd this
 * workspace's people out of the result window.
 */
export async function matchingMemberUsers(ctx: Ctx, re: RegExp, memberFilter: Record<string, unknown>, limit: number) {
  const userIds = await ctx.db(Member).distinct('userId', memberFilter)
  if (!userIds.length) return []
  return User.find({ _id: { $in: userIds }, $or: [{ name: re }, { email: re }] }, { name: 1, email: 1 }).limit(limit).lean()
}
