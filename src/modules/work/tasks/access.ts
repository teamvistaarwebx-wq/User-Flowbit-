/**
 * Who sees and edits which tasks (pure). The server builds a `Viewer` once per
 * request (tasks/viewer.ts) and every list, detail and action uses these rules.
 */

export type Viewer = {
  memberId: string
  /** tasks.manage: sees and edits every non-personal task. */
  manage: boolean
  /** Members of the teams this viewer leads (including the viewer). */
  leadOf: string[]
  /** Projects the viewer leads, belongs to or created. */
  projectIds: string[]
  /** Spaces the viewer has full access to. */
  spaceIds: string[]
}

type Id = unknown
type TaskLike = {
  isPersonal?: boolean | null
  creatorId?: Id
  assigneeIds?: Id[] | null
  sharedWith?: Id[] | null
  watcherIds?: Id[] | null
  projectId?: Id
  spaceId?: Id
}

const has = (list: Id[] | null | undefined, id: string) => Boolean(list?.some((x) => String(x) === id))
const same = (a: Id, id: string) => a != null && String(a) === id

/** Match for non-personal tasks the viewer can see. */
export function visibleTasksMatch(v: Viewer, toId: (id: string) => Id = (id) => id): Record<string, unknown> {
  if (v.manage) return { isPersonal: { $ne: true } }
  const me = toId(v.memberId)
  const or: Record<string, unknown>[] = [{ assigneeIds: me }, { creatorId: me }, { watcherIds: me }]
  if (v.leadOf.length) or.push({ assigneeIds: { $in: v.leadOf.map(toId) } })
  if (v.projectIds.length) or.push({ projectId: { $in: v.projectIds.map(toId) } })
  if (v.spaceIds.length) or.push({ spaceId: { $in: v.spaceIds.map(toId) } })
  return { isPersonal: { $ne: true }, $or: or }
}

/** Match for the Personal view: my private to-dos and those shared with me. */
export function personalTasksMatch(v: Viewer, toId: (id: string) => Id = (id) => id): Record<string, unknown> {
  const me = toId(v.memberId)
  return { isPersonal: true, $or: [{ assigneeIds: me }, { creatorId: me }, { sharedWith: me }] }
}

const isStakeholder = (v: Viewer, t: TaskLike) => same(t.creatorId, v.memberId) || has(t.assigneeIds, v.memberId)

export function canAccessTask(v: Viewer, t: TaskLike): boolean {
  // Personal to-dos stay private even from tasks.manage (FOUNDATION §10).
  if (t.isPersonal) return isStakeholder(v, t) || has(t.sharedWith, v.memberId)
  if (v.manage || isStakeholder(v, t) || has(t.watcherIds, v.memberId)) return true
  if (t.projectId && v.projectIds.includes(String(t.projectId))) return true
  if (t.spaceId && v.spaceIds.includes(String(t.spaceId))) return true
  return Boolean(t.assigneeIds?.some((a) => v.leadOf.includes(String(a))))
}

/** Edit, delete and reassign: creator, assignees, or tasks.manage (personal tasks: only their people). */
export function canModifyTask(v: Viewer, t: TaskLike): boolean {
  if (isStakeholder(v, t)) return true
  return !t.isPersonal && v.manage
}

/** Only the creator or an assignee manages who a personal task is shared with. */
export const canShareTask = (v: Viewer, t: TaskLike) => Boolean(t.isPersonal) && isStakeholder(v, t)
