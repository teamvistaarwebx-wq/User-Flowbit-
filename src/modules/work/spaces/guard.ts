import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { Folder } from '@/models/work/Folder'
import { canEditFolders, canManageSpace } from './access'
import { findSpace } from './queries'

/** A space the member manages (creator or spaces.manage). */
export async function managedSpace(ctx: Ctx, id: string) {
  const space = await findSpace(ctx, id)
  if (!space) throw new NotFoundError('That space')
  if (!canManageSpace(String(ctx.memberId), ctx.can('spaces.manage'), space)) throw new ForbiddenError('Only the space owner or a workspace manager can change this space.')
  return space
}

/** A space whose lists the member may change (full access). */
export async function folderSpace(ctx: Ctx, id: string) {
  const space = await findSpace(ctx, id)
  if (!space) throw new NotFoundError('That space')
  if (!canEditFolders(String(ctx.memberId), ctx.can('spaces.manage'), space)) throw new ForbiddenError("You need full access to this space to change its lists. Ask the space owner to add you.")
  return space
}

/** A list plus its space, checked for full access. */
export async function editableFolder(ctx: Ctx, id: string) {
  const folder = await ctx.db(Folder).findById(id).lean()
  if (!folder) throw new NotFoundError('That list')
  const space = await folderSpace(ctx, String(folder.spaceId))
  return { folder, space }
}
