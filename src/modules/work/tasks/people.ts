import 'server-only'
import { cache } from 'react'
import type { Ctx } from '@/lib/ctx'
import { fileUrl } from '@/lib/files'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import type { Person } from '@/components/work/tasks/types'
import { upcomingLeave } from '@/modules/work/presence'

/**
 * Everyone in the workspace (active and former members) with display names,
 * for pickers and for showing names on tasks, with upcoming approved leave. Workspaces are small (≤150).
 * Cached per request.
 */
export const getPeople = cache(async (ctx: Ctx): Promise<Person[]> => {
  const [members, leave] = await Promise.all([
    ctx.db(Member).find({ status: { $in: ['active', 'disabled'] } }, { userId: 1, title: 1, department: 1, status: 1 }).lean(),
    upcomingLeave(ctx),
  ])
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1, avatarFileId: 1 }).lean()
  const byUser = new Map(users.map((u) => [String(u._id), u]))
  return members
    .map((m) => {
      const user = byUser.get(String(m.userId))
      return {
        id: String(m._id),
        name: user?.name ?? 'Former member',
        email: user?.email ?? '',
        title: m.title ?? undefined,
        department: m.department ?? undefined,
        active: m.status === 'active',
        avatarUrl: user?.avatarFileId ? fileUrl(user.avatarFileId) : undefined,
        ...(leave.has(String(m._id)) ? { leaveDates: leave.get(String(m._id)) } : {}),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

/** id -> Person lookup with a safe fallback name. */
export function peopleIndex(people: Person[]) {
  const map = new Map(people.map((p) => [p.id, p]))
  return {
    get: (id: unknown) => map.get(String(id)),
    name: (id: unknown) => map.get(String(id))?.name ?? 'Someone',
    many: (ids: unknown[] | null | undefined) => (ids ?? []).map((id) => map.get(String(id))).filter((p): p is Person => Boolean(p)),
  }
}

/** Active member ids among `ids` (for assignment checks). */
export async function activeMemberIds(ctx: Ctx, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await ctx.db(Member).find({ _id: { $in: ids }, status: 'active' }, { _id: 1 }).lean()
  return new Set(rows.map((r) => String(r._id)))
}
