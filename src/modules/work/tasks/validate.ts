import 'server-only'
import { isValidObjectId, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { Client } from '@/models/Client'
import { Folder } from '@/models/work/Folder'
import { Milestone } from '@/models/work/Milestone'
import { Project } from '@/models/work/Project'
import { Space } from '@/models/work/Space'
import { canAccessProject } from '@/modules/work/projects/access'
import type { Viewer } from './access'
import { TAG_MAX, TITLE_MAX, TITLE_MIN } from './constants'
import { activeMemberIds } from './people'
import { isPlausibleDate, MAX_TASK_YEAR, MIN_TASK_YEAR } from './due'

/** Shared checks for creating and editing tasks. Each throws a UserError with a field error. */

const MAX_TAGS = 20

export function checkTitle(title: string): string {
  const clean = title.trim()
  if (clean.length < TITLE_MIN) throw new UserError(`Title must be at least ${TITLE_MIN} characters`, { title: `Title must be at least ${TITLE_MIN} characters` })
  if (clean.length > TITLE_MAX) throw new UserError('Title is too long', { title: `Use at most ${TITLE_MAX} characters` })
  return clean
}

/** Refuses a typing slip such as year 0002 for the dates being set (an empty value clears the date). */
export function checkDateYears(startDate: string | null | undefined, dueDate: string | null | undefined): void {
  if (startDate && !isPlausibleDate(startDate)) throw new UserError(`Pick a start date between ${MIN_TASK_YEAR} and ${MAX_TASK_YEAR}.`, { startDate: 'Pick a real date' })
  if (dueDate && !isPlausibleDate(dueDate)) throw new UserError(`Pick a due date between ${MIN_TASK_YEAR} and ${MAX_TASK_YEAR}.`, { dueDate: 'Pick a real date' })
}

export function checkDates(startDate: string | null | undefined, dueDate: string | null | undefined): void {
  if (startDate && dueDate && dueDate < startDate) {
    throw new UserError('Due date cannot be before start date. Pick a date on or after the start date.', { dueDate: 'Due date cannot be before start date' })
  }
}

export function cleanTags(tags: string[]): string[] {
  const out = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
  if (out.some((t) => t.length > TAG_MAX)) throw new UserError(`Tags can be at most ${TAG_MAX} characters`, { tags: `Use at most ${TAG_MAX} characters per tag` })
  return out.slice(0, MAX_TAGS)
}

const toId = (id: string) => new Types.ObjectId(id)

/** Assignees must be active members; personal tasks belong to their creator only. */
export async function checkAssignees(ctx: Ctx, ids: string[], opts: { personal?: boolean } = {}): Promise<Types.ObjectId[]> {
  const unique = [...new Set(ids)].filter((id) => isValidObjectId(id))
  if (!unique.length) throw new UserError('A task needs at least one assignee', { assigneeIds: 'Pick at least one person' })
  if (opts.personal && unique.some((id) => id !== String(ctx.memberId))) {
    throw new UserError('Personal tasks are assigned to you only.', { assigneeIds: 'Personal tasks are assigned to you only' })
  }
  const active = await activeMemberIds(ctx, unique)
  if (active.size !== unique.length) throw new UserError("One or more assignees aren't active in this workspace.", { assigneeIds: 'Pick active members only' })
  return unique.map(toId)
}

export async function resolveProject(ctx: Ctx, viewer: Viewer, id: string) {
  const project = isValidObjectId(id) ? await ctx.db(Project).findById(id).lean() : null
  if (!project || project.archivedAt) throw new UserError('That project was not found or is archived.', { projectId: 'Choose an active project' })
  if (!canAccessProject(viewer.memberId, ctx.can('projects.write'), project)) {
    throw new UserError("You aren't on that project. Ask its lead to add you.", { projectId: "You aren't on this project" })
  }
  return project
}

export async function resolveSpaceFolder(ctx: Ctx, viewer: Viewer, spaceId: string, folderId: string | null | undefined) {
  const space = isValidObjectId(spaceId) ? await ctx.db(Space).findById(spaceId).lean() : null
  if (!space || space.archivedAt) throw new UserError('That space was not found or is archived.', { spaceId: 'Choose an active space' })
  if (!viewer.spaceIds.includes(String(space._id))) {
    throw new UserError("You don't have permission to create tasks in this space", { spaceId: 'Ask the space owner to add you' })
  }
  if (!folderId) throw new UserError('Tasks live inside a list. Pick a list in this space.', { folderId: 'Pick a list' })
  const folder = isValidObjectId(folderId) ? await ctx.db(Folder).findOne({ _id: folderId, spaceId: space._id, archivedAt: null }).lean() : null
  if (!folder) throw new UserError('That list is not in this space.', { folderId: 'Pick a list in this space' })
  return { space, folder }
}

export async function resolveClient(ctx: Ctx, id: string) {
  const client = isValidObjectId(id) ? await ctx.db(Client).findById(id, { name: 1 }).lean() : null
  if (!client) throw new UserError('That client was not found.', { clientId: 'Choose a client' })
  return client
}

export async function resolveMilestone(ctx: Ctx, id: string, projectId: Types.ObjectId | null | undefined) {
  if (!projectId) throw new UserError('Put the task in a project before linking a milestone.', { milestoneId: 'Pick a project first' })
  const milestone = isValidObjectId(id) ? await ctx.db(Milestone).findOne({ _id: id, projectId }, { title: 1 }).lean() : null
  if (!milestone) throw new UserError("That milestone isn't in this project.", { milestoneId: 'Pick a milestone of this project' })
  return milestone
}
