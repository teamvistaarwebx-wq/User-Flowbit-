import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { escapeRegex } from '@/lib/utils'
import { Employee } from '@/models/muster/Employee'
import { Member } from '@/models/Member'
import { Team } from '@/models/work/Team'
import type { Person } from '../teams/people'
import type { AudienceGroups, ViewerGroups } from './rules'

/**
 * Where members belong for 'groups' audiences: their teams (Work → Teams),
 * department (the member's department) and work location (the linked Muster
 * employee). Locations exist only when Muster records carry one.
 */

export type GroupedPerson = Person & ViewerGroups
/** `isPrivate`: an invite-only team; anyone can join an open one and then read posts aimed at it. */
export type GroupOptions = { teams: { id: string; name: string; isPrivate?: boolean }[]; departments: string[]; locations: string[] }

type PostGroups = { targetTeamIds?: unknown[] | null; targetDepartments?: string[] | null; targetLocations?: string[] | null }

/** A stored post's group targets as plain strings. */
export const groupsOf = (p: PostGroups): AudienceGroups => ({
  teamIds: (p.targetTeamIds ?? []).map(String),
  departments: p.targetDepartments ?? [],
  locations: p.targetLocations ?? [],
})

const uniqueSorted = (values: (string | null | undefined)[]) => [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b))

/** member id -> team ids and member id -> work location, for the given members (all active ones without ids). */
async function membership(ctx: Pick<Ctx, 'db'>, memberIds?: string[]) {
  const [teams, members] = await Promise.all([
    ctx.db(Team).find({ isActive: { $ne: false }, ...(memberIds ? { 'members.memberId': { $in: memberIds } } : {}) }, { members: 1 }).lean(),
    ctx.db(Member).find(memberIds ? { _id: { $in: memberIds } } : { status: 'active' }, { employeeId: 1 }).lean(),
  ])
  const employees = await ctx.db(Employee).find({ _id: { $in: members.map((m) => m.employeeId).filter(Boolean) } }, { workLocation: 1 }).lean()
  const locationOfEmployee = new Map(employees.map((e) => [String(e._id), e.workLocation ?? undefined]))
  const teamIds = new Map<string, string[]>()
  for (const t of teams) for (const m of t.members) teamIds.set(String(m.memberId), [...(teamIds.get(String(m.memberId)) ?? []), String(t._id)])
  const location = new Map(members.map((m) => [String(m._id), m.employeeId ? locationOfEmployee.get(String(m.employeeId)) : undefined]))
  return { teamIds, location }
}

/** People with their teams and location, for audience counts and acknowledgements. */
export async function withGroups(ctx: Pick<Ctx, 'db'>, people: Person[]): Promise<GroupedPerson[]> {
  const { teamIds, location } = await membership(ctx, people.map((p) => p.id))
  return people.map((p) => ({ ...p, teamIds: teamIds.get(p.id) ?? [], location: location.get(p.id) }))
}

/** The signed-in member's groups (feed filtering). */
export async function viewerGroups(ctx: Ctx): Promise<ViewerGroups> {
  const me = String(ctx.memberId)
  const { teamIds, location } = await membership(ctx, [me])
  return { teamIds: teamIds.get(me) ?? [], department: ctx.member.department ?? undefined, location: location.get(me) }
}

/** What the composer offers for a 'groups' audience. */
export async function groupOptions(ctx: Ctx): Promise<GroupOptions> {
  const [teams, departments, locations] = await Promise.all([
    ctx.db(Team).find({ isActive: { $ne: false } }, { name: 1, isPrivate: 1 }).sort({ name: 1 }).lean(),
    ctx.db(Member).distinct('department', { status: 'active' }),
    ctx.db(Employee).distinct('workLocation', { deletedAt: null }),
  ])
  return { teams: teams.map((t) => ({ id: String(t._id), name: t.name, isPrivate: Boolean(t.isPrivate) })), departments: uniqueSorted(departments as string[]), locations: uniqueSorted(locations as string[]) }
}

/** Mongo clause: 'groups' posts aimed at any of the viewer's groups. */
export function groupsClause(viewer: ViewerGroups) {
  const or: Record<string, unknown>[] = []
  if (viewer.teamIds?.length) or.push({ targetTeamIds: { $in: viewer.teamIds } })
  if (viewer.department) or.push({ targetDepartments: new RegExp(`^${escapeRegex(viewer.department.trim())}$`, 'i') })
  if (viewer.location) or.push({ targetLocations: new RegExp(`^${escapeRegex(viewer.location.trim())}$`, 'i') })
  return or.length ? { audience: 'groups', $or: or } : null
}
