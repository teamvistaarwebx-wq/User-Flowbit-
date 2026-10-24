/** Space access tiers (pure): full = creator, member or spaces.manage; scoped = only my own tasks inside. */

type Id = unknown
type SpaceLike = { createdById?: Id; members?: { memberId?: Id }[] | null }

const same = (a: Id, id: string) => a != null && String(a) === id

export const isSpaceMember = (memberId: string, s: SpaceLike) => same(s.createdById, memberId) || Boolean(s.members?.some((m) => same(m.memberId, memberId)))

export const hasFullSpaceAccess = (memberId: string, manageAll: boolean, s: SpaceLike) => manageAll || isSpaceMember(memberId, s)

/** Rename, recolour, archive, delete and members: the creator or spaces.manage. */
export const canManageSpace = (memberId: string, manageAll: boolean, s: SpaceLike) => manageAll || same(s.createdById, memberId)

/** Lists inside a space can be changed by anyone with full access. */
export const canEditFolders = hasFullSpaceAccess
