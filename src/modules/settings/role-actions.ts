'use server'

import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { NotFoundError } from '@/lib/errors'
import { BUILTIN_ROLES } from '@/lib/permissions'
import { escapeRegex, pluralize } from '@/lib/utils'
import { objectId, optionalText } from '@/lib/validation'
import { Member } from '@/models/Member'
import { Role } from '@/models/Role'
import { assertCapacity } from '@/modules/subscription/usage'
import { assertCanGrant, customRolesOf } from './role-access'
import { normalizePermissions, permissionDiff } from './roles'

const OPTS = { perm: 'roles.manage' } as const
const BUILTIN_LABELS = new Set(Object.values(BUILTIN_ROLES).map((r) => r.label.toLowerCase()))

const roleSchema = z.object({
  id: objectId.optional(),
  name: z.string().trim().min(2, 'Use at least 2 characters').max(40, 'Use at most 40 characters'),
  description: optionalText(200),
  permissions: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.string())),
})

/** Creates or edits a custom role (built-in roles are read-only). */
export const saveRole = action(
  roleSchema,
  async (input, ctx) => {
    const permissions = normalizePermissions(input.permissions)
    const nameTaken = BUILTIN_LABELS.has(input.name.toLowerCase()) || (await ctx.db(Role).exists({ builtIn: false, label: new RegExp(`^${escapeRegex(input.name)}$`, 'i'), ...(input.id ? { _id: { $ne: input.id } } : {}) }))
    if (nameTaken) return fail('A role with that name already exists.', { name: 'A role with that name already exists.' })
    assertCanGrant(ctx, permissions)

    if (!input.id) {
      const id = new Types.ObjectId()
      await ctx.db(Role).create({ _id: id, key: String(id), label: input.name, description: input.description, permissions, builtIn: false })
      await audit(ctx, { action: 'role.created', entity: 'Role', entityId: id, summary: `Created role ${input.name}`, meta: { after: { name: input.name, permissions } } })
      revalidatePath('/app/settings/roles')
      return ok(`Role created: ${input.name}. Give it to someone from Members.`, { id: String(id) })
    }

    const role = await ctx.db(Role).findOne({ _id: input.id, builtIn: false }).lean()
    if (!role) throw new NotFoundError('That role')
    assertCanGrant(ctx, role.permissions)
    const holders = await ctx.db(Member).countDocuments({ role: String(role._id), status: 'active' })
    if (holders) {
      const customRoles = (await customRolesOf(ctx)).map((r) => (String(r._id) === String(role._id) ? { ...r, permissions } : r))
      await assertCapacity(ctx, { customRoles })
    }
    await ctx.db(Role).updateOne({ _id: role._id }, { $set: { label: input.name, description: input.description, permissions } })
    const { added, removed } = permissionDiff(role.permissions, permissions)
    await audit(ctx, {
      action: 'role.updated',
      entity: 'Role',
      entityId: role._id,
      summary: `Permissions saved for ${input.name}: ${added.length} added, ${removed.length} removed`,
      meta: { added, removed, ...(role.label !== input.name ? { renamedFrom: role.label, renamedTo: input.name } : {}) },
    })
    revalidatePath('/app/settings/roles')
    return ok(`Permissions saved for ${input.name}: ${added.length} added, ${removed.length} removed. It applies on each person's next request.`, { id: String(role._id) })
  },
  OPTS,
)

/** Deletes an unused custom role. */
export const deleteRole = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const role = await ctx.db(Role).findOne({ _id: id, builtIn: false }).lean()
    if (!role) throw new NotFoundError('That role')
    assertCanGrant(ctx, role.permissions)
    const holders = await ctx.db(Member).countDocuments({ role: String(role._id) })
    if (holders) return fail(`${pluralize(holders, 'person', 'people')} hold this role. Move them to another role from Members first.`)
    await ctx.db(Role).deleteOne({ _id: role._id })
    await audit(ctx, { action: 'role.deleted', entity: 'Role', entityId: role._id, summary: `Deleted role ${role.label}`, meta: { before: { name: role.label, permissions: role.permissions } } })
    revalidatePath('/app/settings/roles')
    return ok(`Role deleted: ${role.label}.`)
  },
  OPTS,
)
