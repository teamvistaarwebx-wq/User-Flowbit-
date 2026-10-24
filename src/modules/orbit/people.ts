import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { resolvePermissions } from '@/lib/permissions'
import { Member } from '@/models/Member'
import { Role } from '@/models/Role'
import { User } from '@/models/User'

export type OrbitPerson = { id: string; name: string; title?: string; active: boolean; canWrite: boolean; canClose: boolean }
export type PeopleIndex = Map<string, OrbitPerson>

/** Workspace members with their names and Orbit powers (custom roles included). */
export async function orbitPeople(ctx: Ctx): Promise<OrbitPerson[]> {
  const [members, roles] = await Promise.all([
    ctx.db(Member).find({ status: { $in: ['active', 'disabled'] } }).lean(),
    ctx.db(Role).find({ builtIn: false }).lean(),
  ])
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  const names = new Map(users.map((u) => [String(u._id), u.name]))
  const custom = roles.map((r) => ({ _id: r._id, key: r.key, label: r.label, permissions: r.permissions }))
  return members
    .map((m) => {
      const perms = resolvePermissions(m.role, custom)
      return {
        id: String(m._id),
        name: names.get(String(m.userId)) ?? 'Member',
        title: m.title ?? undefined,
        active: m.status === 'active',
        canWrite: perms.has('leads.write') || perms.has('deals.write'),
        canClose: perms.has('orbit.close'),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const peopleIndex = (people: OrbitPerson[]): PeopleIndex => new Map(people.map((p) => [p.id, p]))
export const nameOf = (index: PeopleIndex, id: Types.ObjectId | string | null | undefined) => (id ? (index.get(String(id))?.name ?? 'Former member') : '—')

/** Select options: owners (can write) and reviewers (can close), active only. */
export const ownerOptions = (people: OrbitPerson[]) => people.filter((p) => p.active && p.canWrite).map((p) => ({ value: p.id, label: p.name, hint: p.title }))
export const reviewerOptions = (people: OrbitPerson[]) => people.filter((p) => p.active && p.canClose).map((p) => ({ value: p.id, label: p.name, hint: p.title }))

/** Refuses ids that are not active members of this workspace. */
export async function assertActiveMembers(ctx: Ctx, ids: Array<string | null | undefined>, message = "That person isn't an active member of this workspace."): Promise<void> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))]
  if (!unique.length) return
  const count = await ctx.db(Member).countDocuments({ _id: { $in: unique }, status: 'active' })
  if (count !== unique.length) throw new UserError(message)
}
