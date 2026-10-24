import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError, UserError } from '@/lib/errors'
import { Whiteboard } from '@/models/work/Whiteboard'

/** Boards I own or that are shared with me; every board with tasks.manage (view). */
export const boardScope = (ctx: Ctx) => (ctx.can('tasks.manage') ? {} : { $or: [{ ownerId: ctx.memberId }, { sharedWith: ctx.memberId }] })

export const isOwner = (ctx: Ctx, b: { ownerId: unknown }) => String(b.ownerId) === String(ctx.memberId)

/** Owner and shared members edit (with whiteboards.write). */
export const canEditBoard = (ctx: Ctx, b: { ownerId: unknown; sharedWith: unknown[] }) =>
  ctx.can('whiteboards.write') && (isOwner(ctx, b) || b.sharedWith.some((id) => String(id) === String(ctx.memberId)))

export async function loadBoard(ctx: Ctx, id: string) {
  const board = await ctx.db(Whiteboard).findOne({ _id: id, archivedAt: null, ...boardScope(ctx) }).lean()
  if (!board) throw new NotFoundError('That whiteboard')
  return board
}

export async function loadEditableBoard(ctx: Ctx, id: string) {
  const board = await loadBoard(ctx, id)
  if (!canEditBoard(ctx, board)) throw new UserError('You can view this board but not edit it. Ask the owner to share it with you.')
  return board
}
