import 'server-only'
import { isValidObjectId } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { addDays, istInstant } from '@/lib/dates'
import { Team } from '@/models/work/Team'
import type { MongoFilter } from './mongo-filter'

export type ReportScope = { projectId?: string; teamId?: string; assigneeId?: string }

export const validId = (v: string | undefined) => (v && isValidObjectId(v) ? v : undefined)

/** Task filter and member list for the scope (team and assignee intersect). */
export async function resolveScope(ctx: Ctx, scope: ReportScope): Promise<{ task: MongoFilter; memberIds?: string[] }> {
  let memberIds: string[] | undefined
  if (scope.teamId) {
    const team = await ctx.db(Team).findById(scope.teamId, { members: 1 }).lean()
    memberIds = team ? team.members.map((m) => String(m.memberId)) : []
  }
  if (scope.assigneeId) memberIds = memberIds ? memberIds.filter((id) => id === scope.assigneeId) : [scope.assigneeId]
  const task: MongoFilter = { isPersonal: { $ne: true } }
  if (scope.projectId) task.projectId = scope.projectId
  if (memberIds) task.assigneeIds = { $in: memberIds }
  return { task, memberIds }
}

/** IST instants bounding a 'YYYY-MM-DD' range (end exclusive). */
export const instantRange = (range: { from: string; to: string }) => ({ $gte: istInstant(range.from), $lt: istInstant(addDays(range.to, 1)) })
