import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { Member } from '@/models/Member'
import { User } from '@/models/User'

export type Person = { id: string; name: string; email: string; title?: string; department?: string; role: string; managerId?: string; active: boolean }
export type PeopleMap = Map<string, Person>

type Id = Types.ObjectId | string

/**
 * Members of this workspace with their display names. Without `ids` it returns
 * active members (pickers); with `ids` it returns those members whatever their
 * status (showing people on existing records).
 */
export async function listPeople(ctx: Pick<Ctx, 'db'>, ids?: Id[]): Promise<Person[]> {
  const filter = ids ? { _id: { $in: [...new Set(ids.map(String))] } } : { status: 'active' }
  const members = await ctx.db(Member).find(filter).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1 }).lean()
  const byUser = new Map(users.map((u) => [String(u._id), u]))
  return members
    .map((m) => {
      const u = byUser.get(String(m.userId))
      return {
        id: String(m._id),
        name: u?.name ?? 'Member',
        email: u?.email ?? '',
        title: m.title ?? undefined,
        department: m.department ?? undefined,
        role: m.role,
        managerId: m.managerId ? String(m.managerId) : undefined,
        active: m.status === 'active',
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function peopleMap(ctx: Ctx, ids?: Id[]): Promise<PeopleMap> {
  return new Map((await listPeople(ctx, ids)).map((p) => [p.id, p]))
}

export const nameOf = (people: PeopleMap, id: Id | null | undefined) => (id ? (people.get(String(id))?.name ?? 'Former member') : '—')

/** Options for Select / pickers. */
export const personOptions = (people: Person[]) => people.map((p) => ({ value: p.id, label: p.name, hint: p.title }))

/** Refuses ids that are not active members of this workspace. */
export async function assertActiveMembers(ctx: Ctx, ids: string[], message = "One or more people aren't in this workspace"): Promise<void> {
  const unique = [...new Set(ids)]
  if (!unique.length) return
  const count = await ctx.db(Member).countDocuments({ _id: { $in: unique }, status: 'active' })
  if (count !== unique.length) throw new UserError(message)
}
