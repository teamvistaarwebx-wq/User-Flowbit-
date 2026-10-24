import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { Post } from '@/models/work/Post'
import { groupsClause, groupsOf, viewerGroups } from './audience'
import { canSeePost, type ViewerGroups } from './rules'
import { visibleNowFilter } from './schedule'
import type { MongoFilter } from '../reports/mongo-filter'

export const isModerator = (ctx: Ctx) => ctx.can('posts.manage')

/**
 * Mongo filter for posts the member may see: audience enforced, and scheduled posts only for their author.
 * `audienceOnly` applies the audience to moderators too (the announcement pop-up).
 */
export function postScope(ctx: Ctx, groups: ViewerGroups = {}, opts: { audienceOnly?: boolean } = {}): MongoFilter {
  const published = visibleNowFilter(ctx.memberId)
  if (isModerator(ctx) && !opts.audienceOnly) return published
  const me = ctx.memberId
  const group = groupsClause(groups)
  const audience = { $or: [{ audience: 'org' }, { audience: 'roles', targetRoles: { $in: ['ALL', ctx.role] } }, ...(group ? [group] : []), { authorId: me }, { mentionIds: me }, { featuredIds: me }] }
  return { $and: [published, audience] }
}

type AudienceSource = { authorId: unknown; audience: string; targetRoles: string[]; mentionIds: unknown[]; featuredIds?: unknown[] | null; targetTeamIds?: unknown[] | null; targetDepartments?: string[] | null; targetLocations?: string[] | null }

export const audienceOf = (p: AudienceSource) => ({
  authorId: String(p.authorId),
  audience: p.audience,
  targetRoles: p.targetRoles,
  mentionIds: p.mentionIds.map(String),
  featuredIds: (p.featuredIds ?? []).map(String),
  groups: groupsOf(p),
})

/** True when the signed-in member may see this stored post (a scheduled one only by its author or a moderator). */
export async function memberCanSee(ctx: Ctx, post: AudienceSource & { published?: boolean | null }): Promise<boolean> {
  const mine = String(post.authorId) === String(ctx.memberId)
  if (post.published === false && !mine && !isModerator(ctx)) return false
  const groups = post.audience === 'groups' ? await viewerGroups(ctx) : {}
  return canSeePost(audienceOf(post), { memberId: String(ctx.memberId), role: ctx.role, isModerator: isModerator(ctx), ...groups })
}

/** A live post the member can see, or NotFound. */
export async function loadPost(ctx: Ctx, id: string) {
  const post = await ctx.db(Post).findOne({ _id: id, deletedAt: null }).lean()
  if (!post || !(await memberCanSee(ctx, post))) throw new NotFoundError('That post')
  return post
}
