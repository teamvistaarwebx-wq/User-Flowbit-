/** Project visibility and edit rights (pure). `readAll`/`write` = the projects.write permission. */

type Id = unknown
type ProjectLike = { leadId?: Id; memberIds?: Id[] | null; createdById?: Id }

const same = (a: Id, id: string) => a != null && String(a) === id

export const isProjectPerson = (memberId: string, p: ProjectLike) =>
  same(p.leadId, memberId) || same(p.createdById, memberId) || Boolean(p.memberIds?.some((m) => String(m) === memberId))

/** Projects list/detail: everyone with projects.write, otherwise lead, members and creator. */
export const canAccessProject = (memberId: string, readAll: boolean, p: ProjectLike) => readAll || isProjectPerson(memberId, p)

/** Edit details and members: projects.write, or the project's lead. */
export const canEditProject = (memberId: string, write: boolean, p: ProjectLike) => write || same(p.leadId, memberId)

/** Match for the projects a member can open. */
export function projectAccessMatch(memberId: string, readAll: boolean, toId: (id: string) => Id = (id) => id): Record<string, unknown> {
  if (readAll) return {}
  const me = toId(memberId)
  return { $or: [{ leadId: me }, { memberIds: me }, { createdById: me }] }
}
