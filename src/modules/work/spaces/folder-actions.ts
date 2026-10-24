'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { objectId, optionalText, requiredText } from '@/lib/validation'
import { Folder } from '@/models/work/Folder'
import { Task } from '@/models/work/Task'
import { revalidateWork } from '@/modules/work/tasks/revalidate'
import { HEX_COLOR } from './constants'
import { editableFolder, folderSpace } from './guard'

const WORK = { product: 'work', perm: 'tasks.write' } as const

const folderFields = z.object({
  name: requiredText('List name', 80),
  description: optionalText(500),
  color: z.string().regex(HEX_COLOR, 'Pick a colour').default('#7E768C'),
})

export const createFolder = action(
  folderFields.extend({ spaceId: objectId }),
  async ({ spaceId, ...input }, ctx) => {
    const space = await folderSpace(ctx, spaceId)
    const last = await ctx.db(Folder).findOne({ spaceId: space._id }, { order: 1 }).sort({ order: -1 }).lean()
    const folder = await ctx.db(Folder).create({ ...input, spaceId: space._id, order: (last?.order ?? 0) + 1, createdById: ctx.memberId })
    revalidateWork()
    return ok(`List '${folder.name}' created`, { id: String(folder._id) })
  },
  WORK,
)

export const updateFolder = action(
  folderFields.extend({ id: objectId }),
  async ({ id, ...input }, ctx) => {
    const { folder } = await editableFolder(ctx, id)
    await ctx.db(Folder).updateOne({ _id: folder._id }, { $set: { ...input, description: input.description ?? null } })
    revalidateWork()
    return ok(`List '${input.name}' saved`)
  },
  WORK,
)

/** Archive (default delete) or restore a list; archived lists are hidden. */
export const setFolderArchived = action(
  z.object({ id: objectId, archived: z.boolean() }),
  async ({ id, archived }, ctx) => {
    const { folder } = await editableFolder(ctx, id)
    await ctx.db(Folder).updateOne({ _id: folder._id }, { $set: { archivedAt: archived ? new Date() : null } })
    revalidateWork()
    return ok(archived ? `List '${folder.name}' archived` : `List '${folder.name}' restored`)
  },
  WORK,
)

/** Delete permanently: its tasks move out of the list but stay in the space. */
export const deleteFolder = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const { folder } = await editableFolder(ctx, id)
    const moved = await ctx.db(Task).updateMany({ folderId: folder._id }, { $unset: { folderId: '' } })
    await ctx.db(Folder).deleteOne({ _id: folder._id })
    revalidateWork()
    return ok(`List '${folder.name}' deleted${moved.modifiedCount ? `; ${moved.modifiedCount} tasks stay in the space` : ''}`)
  },
  WORK,
)

/** Drag to reorder lists: ids in their new order. */
export const reorderFolders = action(
  z.object({ spaceId: objectId, ids: z.array(objectId).min(1) }),
  async ({ spaceId, ids }, ctx) => {
    const space = await folderSpace(ctx, spaceId)
    await Promise.all(ids.map((id, order) => ctx.db(Folder).updateOne({ _id: id, spaceId: space._id }, { $set: { order } })))
    revalidateWork()
    return ok()
  },
  WORK,
)
