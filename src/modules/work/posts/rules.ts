/** Pure post rules: who sees a post, reaction toggling, read-receipt counts. */

export const REACTION_EMOJIS = ['👍', '❤️', '🎉', '👏', '🙌', '😂'] as const
export const POST_SORTS = ['newest', 'oldest', 'active'] as const
export type PostSort = (typeof POST_SORTS)[number]

/** Targets of a 'groups' audience: teams (ids), departments and work locations (names). */
export type AudienceGroups = { teamIds?: string[]; departments?: string[]; locations?: string[] }
export type AudiencePost = { authorId: string; audience: string; targetRoles: string[]; mentionIds: string[]; featuredIds?: string[]; groups?: AudienceGroups }
/** Where the viewer belongs, for 'groups' audiences. */
export type ViewerGroups = { teamIds?: string[]; department?: string; location?: string }
export type Viewer = { memberId: string; role: string; isModerator: boolean } & ViewerGroups

const sameText = (a: string | undefined, b: string) => Boolean(a) && a!.trim().toLowerCase() === b.trim().toLowerCase()

/** True when the viewer is in any targeted team, department or location. */
export function inGroups(groups: AudienceGroups | undefined, viewer: ViewerGroups): boolean {
  if (!groups) return false
  if ((groups.teamIds ?? []).some((id) => (viewer.teamIds ?? []).includes(id))) return true
  if ((groups.departments ?? []).some((d) => sameText(viewer.department, d))) return true
  return (groups.locations ?? []).some((l) => sameText(viewer.location, l))
}

/**
 * org -> everyone; roles -> members whose role is targeted (or 'ALL'); groups -> members of a targeted
 * team, department or location; private -> author and mentioned. Author, moderators, mentioned and
 * featured people (kudos, welcome) always see it.
 */
export function canSeePost(post: AudiencePost, viewer: Viewer): boolean {
  if (viewer.isModerator || post.authorId === viewer.memberId || post.mentionIds.includes(viewer.memberId) || (post.featuredIds ?? []).includes(viewer.memberId)) return true
  if (post.audience === 'org') return true
  if (post.audience === 'roles') return post.targetRoles.includes('ALL') || post.targetRoles.includes(viewer.role)
  if (post.audience === 'groups') return inGroups(post.groups, viewer)
  return false
}

/** Members in the post's audience (for "Seen by 12 of 20" and acknowledgements). */
export function audienceMembers<T extends { id: string; role: string } & ViewerGroups>(post: AudiencePost, members: T[]): T[] {
  return members.filter((m) => canSeePost(post, { memberId: m.id, role: m.role, isModerator: false, teamIds: m.teamIds, department: m.department, location: m.location }))
}

export type ReactionGroup = { emoji: string; memberIds: string[] }

/** Toggles `memberId` on `emoji`; empty groups are dropped. Returns new groups (no mutation). */
export function toggleReaction(groups: ReactionGroup[], emoji: string, memberId: string): ReactionGroup[] {
  const existing = groups.find((g) => g.emoji === emoji)
  if (!existing) return [...groups, { emoji, memberIds: [memberId] }]
  return groups
    .map((g) => (g.emoji !== emoji ? g : { ...g, memberIds: g.memberIds.includes(memberId) ? g.memberIds.filter((id) => id !== memberId) : [...g.memberIds, memberId] }))
    .filter((g) => g.memberIds.length > 0)
}

/** Reaction chips for the UI: count and whether I reacted. */
export const reactionSummary = (groups: ReactionGroup[], memberId: string) => groups.map((g) => ({ emoji: g.emoji, count: g.memberIds.length, mine: g.memberIds.includes(memberId) }))

/**
 * Recipients of a newly published post: announcements and policies reach the audience; the mentioned and
 * the featured (kudos, welcome) hear about it either way. Never the author; nobody twice.
 */
export function postRecipients(post: AudiencePost & { category: string }, members: ({ id: string; role: string } & ViewerGroups)[]): { audience: string[]; mentioned: string[]; featured: string[] } {
  const wide = post.category === 'announcement' || post.category === 'policy'
  const audience = wide ? audienceMembers(post, members).map((m) => m.id).filter((id) => id !== post.authorId) : []
  const featured = [...new Set(post.featuredIds ?? [])].filter((id) => id !== post.authorId && !audience.includes(id))
  const mentioned = [...new Set(post.mentionIds)].filter((id) => id !== post.authorId && !audience.includes(id) && !featured.includes(id))
  return { audience, mentioned, featured }
}

/** Managers to tell about kudos: each featured person's manager, except the author and people featured themselves. */
export function kudosManagers(featured: { id: string; managerId?: string }[], authorId: string): string[] {
  const ids = new Set(featured.map((f) => f.id))
  return [...new Set(featured.map((f) => f.managerId).filter((m): m is string => Boolean(m) && m !== authorId && !ids.has(m!)))]
}
