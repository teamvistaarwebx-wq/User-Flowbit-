import 'server-only'
import { isValidObjectId } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { saveFile } from '@/lib/files'
import { UserError } from '@/lib/errors'
import { StoredFile } from '@/models/StoredFile'
import { Whiteboard } from '@/models/work/Whiteboard'
import { loadEditableBoard } from './access'
import { IMAGE_MIME, decodeDataUrl, pickAppState, referencedFileIds, type SavePayload } from './scene'

type StoredRef = { fileId: string; mimeType: string }

/** Stores new pasted images as StoredFiles; keeps only refs for images still on the board. */
async function storeFiles(ctx: Ctx, boardId: unknown, payload: SavePayload, known: Record<string, StoredRef>): Promise<Record<string, StoredRef>> {
  const used = referencedFileIds(payload.elements)
  const out: Record<string, StoredRef> = {}
  // A client-sent file id is kept only when it is one of this board's own images (never another record's file).
  const claimed = [...used].map((id) => payload.files[id]?.fileId).filter((v): v is string => Boolean(v) && isValidObjectId(v))
  const boardFiles = claimed.length
    ? new Set((await StoredFile.find({ _id: { $in: claimed }, orgId: ctx.orgId, kind: 'whiteboard', entity: 'Whiteboard', entityId: String(boardId) }, { _id: 1 }).lean()).map((f) => String(f._id)))
    : new Set<string>()
  for (const id of used) {
    const incoming = payload.files[id]
    if (known[id]) out[id] = known[id]
    else if (incoming?.fileId && boardFiles.has(incoming.fileId)) out[id] = { fileId: incoming.fileId, mimeType: incoming.mimeType }
    else if (incoming?.dataURL) {
      const decoded = decodeDataUrl(incoming.dataURL)
      if (!decoded || !(IMAGE_MIME as readonly string[]).includes(decoded.mime)) throw new UserError('Only PNG, JPEG, WebP and GIF images can be added to a board.')
      const file = await saveFile(ctx, { name: `whiteboard-${id}.${decoded.mime.split('/')[1]}`, mime: decoded.mime, data: decoded.data, kind: 'whiteboard', entity: 'Whiteboard', entityId: boardId })
      out[id] = { fileId: String(file._id), mimeType: decoded.mime }
    }
  }
  return out
}

/**
 * Saves the scene with a version check (last write wins only when nobody saved
 * in between). Returns the new version and the stored file refs.
 */
export async function saveScene(ctx: Ctx, id: string, payload: SavePayload): Promise<{ version: number; files: Record<string, StoredRef> } | { conflict: true }> {
  const board = await loadEditableBoard(ctx, id)
  if (board.version !== payload.version) return { conflict: true }
  const files = await storeFiles(ctx, board._id, payload, (board.scene?.files ?? {}) as Record<string, StoredRef>)
  const elements = payload.elements.filter((e) => !e.isDeleted)
  const updated = await ctx.db(Whiteboard).findOneAndUpdate(
    { _id: board._id, version: payload.version },
    {
      $set: { 'scene.elements': elements, 'scene.appState': pickAppState(payload.appState), 'scene.files': files, lastEditedById: ctx.memberId, ...(payload.thumbnail ? { thumbnail: payload.thumbnail } : {}) },
      $inc: { version: 1 },
    },
  )
  if (!updated) return { conflict: true }
  return { version: updated.version, files }
}
