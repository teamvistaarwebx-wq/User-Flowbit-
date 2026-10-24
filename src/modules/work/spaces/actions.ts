'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { ForbiddenError, NotFoundError, UserError } from '@/lib/errors'
import { objectId, optionalText, requiredText } from '@/lib/validation'
import { Space } from '@/models/work/Space'
import { Task } from '@/models/work/Task'
import { SavedView } from '@/models/work/SavedView'
import { Folder } from '@/models/work/Folder'
import { activeMemberIds } from '@/modules/work/tasks/people'
import { revalidateWork } from '@/modules/work/tasks/revalidate'
import { canManageSpace } from './access'
import { HEX_COLOR, SPACE_ICONS } from './constants'
import { managedSpace } from './guard'
import { findSpace } from './queries'

const WORK = { product: 'work', perm: 'tasks.write' } as const

const spaceFields = z.object({
  name: requiredText('Space name', 80),
  description: optionalText(500),
  color: z.string().regex(HEX_COLOR, 'Pick a colour').default('#818CF8'),
  icon: z.enum(SPACE_ICONS).default('folder'),
})

/** New space; the creator is a full member. */
export const createSpace = action(
  spaceFields,
  async (input, ctx) => {
    const last = await ctx.db(Space).findOne({}, { order: 1 }).sort({ order: -1 }).lean()
    const space = await ctx.db(Space).create({ ...input, order: (last?.order ?? 0) + 1, createdById: ctx.memberId, members: [{ memberId: ctx.memberId, addedById: ctx.memberId }] })
    await audit(ctx, { action: 'space.created', entity: 'Space', entityId: space._id, summary: `Created space ${space.name}`, product: 'work' })
    revalidateWork()
    return ok(`Space '${space.name}' created`, { id: String(space._id) }, `/app/work/spaces/${space._id}`)
  },
  WORK,
)

export const updateSpace = action(
  spaceFields.extend({ id: objectId }),
  async ({ id, ...input }, ctx) => {
    const space = await managedSpace(ctx, id)
    await ctx.db(Space).updateOne({ _id: space._id }, { $set: { ...input, description: input.description ?? null } })
    revalidateWork()
    return ok(`Space '${input.name}' saved`)
  },
  WORK,
)

/** Delete when empty; a space that still has tasks is archived instead. */
export const deleteSpace = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const space = await managedSpace(ctx, id)
    if (await ctx.db(Task).exists({ spaceId: space._id })) {
      await ctx.db(Space).updateOne({ _id: space._id }, { $set: { archivedAt: new Date() } })
      await audit(ctx, { action: 'space.archived', entity: 'Space', entityId: space._id, summary: `Archived space ${space.name}`, product: 'work' })
      revalidateWork()
      return ok(`Space '${space.name}' archived because it still has tasks`, undefined, '/app/work/spaces')
    }
    await Promise.all([ctx.db(Space).deleteOne({ _id: space._id }), ctx.db(Folder).deleteMany({ spaceId: space._id }), ctx.db(SavedView).deleteMany({ spaceId: space._id })])
    await audit(ctx, { action: 'space.deleted', entity: 'Space', entityId: space._id, summary: `Deleted space ${space.name}`, product: 'work' })
    revalidateWork()
    return ok(`Space '${space.name}' deleted`, undefined, '/app/work/spaces')
  },
  WORK,
)

export const setSpaceArchived = action(
  z.object({ id: objectId, archived: z.boolean() }),
  async ({ id, archived }, ctx) => {
    const space = await managedSpace(ctx, id)
    await ctx.db(Space).updateOne({ _id: space._id }, { $set: { archivedAt: archived ? new Date() : null } })
    await audit(ctx, { action: archived ? 'space.archived' : 'space.restored', entity: 'Space', entityId: space._id, summary: `${archived ? 'Archived' : 'Restored'} space ${space.name}`, product: 'work' })
    revalidateWork()
    return ok(archived ? `Space '${space.name}' archived` : `Space '${space.name}' restored`)
  },
  WORK,
)

/** Sharing a space = adding members (creator or spaces.manage). */
export const addSpaceMembers = action(
  z.object({ id: objectId, memberIds: z.array(objectId).min(1, 'Pick at least one person') }),
  async ({ id, memberIds }, ctx) => {
    const space = await managedSpace(ctx, id)
    const active = await activeMemberIds(ctx, memberIds)
    const existing = new Set((space.members ?? []).map((m) => String(m.memberId)))
    const fresh = [...active].filter((m) => !existing.has(m))
    if (!fresh.length) return ok('Everyone picked is already in this space')
    await ctx.db(Space).updateOne({ _id: space._id }, { $push: { members: { $each: fresh.map((memberId) => ({ memberId, addedById: ctx.memberId, addedAt: new Date() })) } } })
    revalidateWork()
    return ok(`Added ${fresh.length} ${fresh.length === 1 ? 'person' : 'people'} to '${space.name}'`)
  },
  WORK,
)

/** Remove a member; anyone may remove themselves, the creator can't be removed. */
export const removeSpaceMember = action(
  z.object({ id: objectId, memberId: objectId }),
  async ({ id, memberId }, ctx) => {
    const space = await findSpace(ctx, id)
    if (!space) throw new NotFoundError('That space')
    const self = memberId === String(ctx.memberId)
    if (!self && !canManageSpace(String(ctx.memberId), ctx.can('spaces.manage'), space)) throw new ForbiddenError('Only the space owner can remove people.')
    if (String(space.createdById) === memberId) throw new UserError("The space's creator can't be removed.")
    await ctx.db(Space).updateOne({ _id: space._id }, { $pull: { members: { memberId } } })
    revalidateWork()
    return ok(self ? `You left '${space.name}'` : `Removed from '${space.name}'`, undefined, self ? '/app/work/spaces' : undefined)
  },
  { product: 'work', perm: 'tasks.read' },
)
