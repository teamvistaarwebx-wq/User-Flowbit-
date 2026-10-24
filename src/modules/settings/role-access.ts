import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { BUILTIN_ROLES, isBuiltInRole, resolvePermissions, roleLabel } from '@/lib/permissions'
import { kindAllowsRole, workspaceKindOf, WORKSPACE_KIND_DEFS } from '@/lib/workspace-kind'
import { Role } from '@/models/Role'
import { escalationMessage, missingGrants } from './roles'

/** The org's custom roles (built-in roles resolve from code). */
export const customRolesOf = (ctx: Ctx) => ctx.db(Role).find({ builtIn: false }).lean()
export type CustomRoleDoc = Awaited<ReturnType<typeof customRolesOf>>[number]

/** Label and permissions of a role key or custom role id; throws for unknown roles. */
export function describeRole(role: string, customRoles: CustomRoleDoc[]): { key: string; label: string; permissions: string[] } {
  if (isBuiltInRole(role)) return { key: role, label: BUILTIN_ROLES[role].label, permissions: [...BUILTIN_ROLES[role].permissions] }
  const custom = customRoles.find((r) => String(r._id) === role || r.key === role)
  if (!custom) throw new UserError('Choose a role from the list.', { role: 'Choose a role' })
  return { key: String(custom._id), label: roleLabel(role, customRoles), permissions: [...resolvePermissions(role, customRoles)] }
}

/**
 * Anti-escalation (platform spec 7.4): a member may grant, assign or edit only
 * roles whose permissions they hold. The owner role is never assignable.
 */
export function assertCanGrant(ctx: Ctx, permissions: readonly string[], opts: { role?: string } = {}): void {
  if (opts.role === 'owner') throw new UserError('Ownership moves only through Transfer ownership.')
  const kind = workspaceKindOf(ctx.org)
  if (opts.role && !kindAllowsRole(kind, opts.role)) throw new UserError(`${roleLabel(opts.role)} isn't used in a ${WORKSPACE_KIND_DEFS[kind].label.toLowerCase()} workspace. Choose another role.`, { role: 'Choose another role' })
  if (ctx.isOwner) return
  const missing = missingGrants(ctx.permissions, permissions)
  if (missing.length) throw new UserError(escalationMessage(missing))
}
