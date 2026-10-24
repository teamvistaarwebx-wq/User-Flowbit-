'use server'

import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { z } from 'zod'
import type { Ctx } from '@/lib/ctx'
import { readStoredFile, saveFile } from '@/lib/files'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { notifyMembers } from '@/lib/notify'
import { listOf, objectId, requiredText } from '@/lib/validation'
import { Whiteboard } from '@/models/work/Whiteboard'
import { assertActiveMembers } from '../teams/people'
import { isOwner, loadBoard, loadEditableBoard } from './access'
import { BOARD_BACKGROUND } from './scene'

const W = { product: 'work', perm: 'whiteboards.write' } as const
const refresh = (id?: string) => {
  revalidatePath('/app/work/whiteboards')
  if (id) revalidatePath(`/app/work/whiteboards/${id}`)
}

export const createWhiteboard = action(
  z.object({ title: z.string().trim().max(100).optional() }),
  async ({ title }, ctx) => {
    const board = await ctx.db(Whiteboard).create({ title: title || 'Untitled whiteboard', ownerId: ctx.memberId, sharedWith: [], scene: { elements: [], appState: { viewBackgroundColor: BOARD_BACKGROUND, gridSize: null, theme: 'dark' }, files: {} }, version: 0, lastEditedById: ctx.memberId })
    refresh()
    return ok('Whiteboard created', { id: String(board._id) }, `/app/work/whiteboards/${board._id}`)
  },
  W,
)

export const renameWhiteboard = action(
  z.object({ id: objectId, title: requiredText('Title', 100) }),
  async ({ id, title }, ctx) => {
    const board = await loadEditableBoard(ctx, id)
    await ctx.db(Whiteboard).updateOne({ _id: board._id }, { $set: { title } })
    refresh(id)
    return ok(`Renamed to '${title}'`)
  },
  W,
)

export const shareWhiteboard = action(
  z.object({ id: objectId, memberIds: listOf(objectId) }),
  async ({ id, memberIds }, ctx) => {
    const board = await loadBoard(ctx, id)
    if (!isOwner(ctx, board)) return fail('Only the owner can change who has access.')
    const next = [...new Set(memberIds)].filter((m) => m !== String(ctx.memberId))
    await assertActiveMembers(ctx, next)
    const added = next.filter((m) => !board.sharedWith.some((s) => String(s) === m))
    await ctx.db(Whiteboard).updateOne({ _id: board._id }, { $set: { sharedWith: next } })
    await notifyMembers(ctx, added, { title: `${ctx.user.name} shared the whiteboard '${board.title}' with you`, href: `/app/work/whiteboards/${id}`, kind: 'info', product: 'work', event: 'whiteboard.shared' })
    refresh(id)
    return ok(next.length ? `Shared with ${next.length} ${next.length === 1 ? 'person' : 'people'}` : 'Only you can open this board now')
  },
  W,
)

type StoredRef = { fileId: string; mimeType: string }

/**
 * Gives a copied board its own image files: an image follows the access rule
 * of the board it belongs to, so the copy must not point at the original's files.
 */
async function copyBoardFiles(ctx: Ctx, refs: Record<string, StoredRef>, copyId: Types.ObjectId): Promise<Record<string, StoredRef>> {
  const out: Record<string, StoredRef> = {}
  for (const [key, ref] of Object.entries(refs)) {
    const original = await readStoredFile(ctx.orgId, ref.fileId)
    if (!original) continue
    const file = await saveFile(ctx, { name: original.file.name, mime: original.file.mime, data: original.data, kind: 'whiteboard', entity: 'Whiteboard', entityId: copyId })
    out[key] = { fileId: String(file._id), mimeType: ref.mimeType }
  }
  return out
}

export const duplicateWhiteboard = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const board = await loadBoard(ctx, id)
    const copyId = new Types.ObjectId()
    const scene = board.scene ? { ...board.scene, files: await copyBoardFiles(ctx, (board.scene.files ?? {}) as Record<string, StoredRef>, copyId) } : board.scene
    const copy = await ctx.db(Whiteboard).create({ _id: copyId, title: `${board.title} (copy)`.slice(0, 100), ownerId: ctx.memberId, sharedWith: [], scene, version: 0, thumbnail: board.thumbnail, lastEditedById: ctx.memberId })
    refresh()
    return ok(`Copied '${board.title}'`, { id: String(copy._id) }, `/app/work/whiteboards/${copy._id}`)
  },
  W,
)

export const deleteWhiteboard = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const board = await loadBoard(ctx, id)
    if (!isOwner(ctx, board) && !ctx.can('tasks.manage')) return fail('Only the owner can delete this board.')
    await ctx.db(Whiteboard).updateOne({ _id: board._id }, { $set: { archivedAt: new Date() } })
    await audit(ctx, { action: 'whiteboard.deleted', entity: 'Whiteboard', entityId: board._id, summary: `Deleted whiteboard '${board.title}'`, product: 'work' })
    refresh(id)
    return ok(`Deleted '${board.title}'`, undefined, '/app/work/whiteboards')
  },
  W,
)
