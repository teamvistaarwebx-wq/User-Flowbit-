import 'server-only'
import { Types } from 'mongoose'
import { cache } from 'react'
import type { Ctx } from '@/lib/ctx'
import { Project } from '@/models/work/Project'
import { Space } from '@/models/work/Space'
import { Team } from '@/models/work/Team'
import { personalTasksMatch, visibleTasksMatch, type Viewer } from './access'

/** Members of the teams the viewer leads (including the viewer). Errors propagate: silently dropping leads' access hides real failures. */
async function teamLeadMemberIds(ctx: Ctx): Promise<string[]> {
  const led = await ctx.db(Team).find({ isActive: { $ne: false }, members: { $elemMatch: { memberId: ctx.memberId, role: 'lead' } } }, { 'members.memberId': 1 }).lean()
  if (!led.length) return []
  return [...new Set([String(ctx.memberId), ...led.flatMap((t) => (t.members ?? []).map((m) => String(m.memberId)))])]
}

/** The signed-in member's task visibility (cached per request). */
export const getViewer = cache(async (ctx: Ctx): Promise<Viewer> => {
  const me = ctx.memberId
  const [leadOf, projectIds, spaceIds] = await Promise.all([
    teamLeadMemberIds(ctx),
    ctx.db(Project).distinct('_id', { $or: [{ leadId: me }, { memberIds: me }, { createdById: me }] }),
    ctx.can('spaces.manage')
      ? ctx.db(Space).distinct('_id', {})
      : ctx.db(Space).distinct('_id', { $or: [{ createdById: me }, { 'members.memberId': me }] }),
  ])
  return {
    memberId: String(me),
    manage: ctx.can('tasks.manage'),
    leadOf,
    projectIds: (projectIds as Types.ObjectId[]).map(String),
    spaceIds: (spaceIds as Types.ObjectId[]).map(String),
  }
})

/**
 * Every task the member can open (Work spec 1.2): visible non-personal tasks plus their own and
 * shared personal ones. Pass `toId` when querying the raw driver (ObjectIds are not cast there).
 */
export async function taskVisibilityFilter(ctx: Ctx, toId?: (id: string) => unknown): Promise<Record<string, unknown>> {
  const viewer = await getViewer(ctx)
  return { $or: [visibleTasksMatch(viewer, toId), personalTasksMatch(viewer, toId)] }
}
