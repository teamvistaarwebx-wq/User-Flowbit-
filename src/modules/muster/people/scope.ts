import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { Employee } from '@/models/muster/Employee'

/**
 * Who the viewer may see. `null` = everyone (people.read_all); otherwise the
 * viewer's own record plus, with people.read_team, their reporting subtree.
 */
export async function visibleEmployeeIds(ctx: Ctx): Promise<string[] | null> {
  if (ctx.can('people.read_all')) return null
  const own = ctx.member.employeeId ? String(ctx.member.employeeId) : null
  if (!own) return []
  if (!ctx.can('people.read_team')) return [own]
  return [own, ...(await reportingSubtree(ctx, own))]
}

const MAX_DEPTH = 10

/** Everyone who reports to `managerId`, directly or not (cycle-safe, depth 10). */
export async function reportingSubtree(ctx: Pick<Ctx, 'db'>, managerId: string): Promise<string[]> {
  const seen = new Set<string>([managerId])
  let frontier = [managerId]
  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth += 1) {
    const rows = await ctx.db(Employee).find({ managerId: { $in: frontier.map((id) => new Types.ObjectId(id)) }, deletedAt: null }, { _id: 1 }).lean()
    frontier = rows.map((r) => String(r._id)).filter((id) => !seen.has(id))
    frontier.forEach((id) => seen.add(id))
  }
  seen.delete(managerId)
  return [...seen]
}

/** Mongo filter piece limiting employees to the visible set. */
export function visibleFilter(ids: string[] | null, field = '_id'): Record<string, unknown> {
  return ids === null ? {} : { [field]: { $in: ids.map((id) => new Types.ObjectId(id)) } }
}

/** Throws NotFound when the viewer may not see this employee (same answer as a missing record). */
export async function assertVisible(ctx: Ctx, employeeId: string): Promise<void> {
  const ids = await visibleEmployeeIds(ctx)
  if (ids !== null && !ids.includes(employeeId)) throw new NotFoundError('That employee')
}

/** Company-wide work (locking a month) needs the whole company in view. */
export const PARTIAL_VIEW_REFUSAL = "This needs the whole company's attendance, and your role sees only part of it."

/** The signed-in member's own employee id, if linked. */
export const ownEmployeeId = (ctx: Ctx): string | null => (ctx.member.employeeId ? String(ctx.member.employeeId) : null)

/** Owners and admins (who could grant themselves anything) may decide on their own records. */
export const mayDecideOwn = (ctx: Ctx) => ctx.can('roles.manage')

/**
 * Linking or inviting a login hands over that record's self-service (PAN, bank,
 * payslips, documents), so it needs sensitive access or member management on top of people.write.
 */
export const mayManageLogins = (ctx: Ctx) => ctx.can('people.write') && ctx.canAny('people.read_sensitive', 'members.manage')
