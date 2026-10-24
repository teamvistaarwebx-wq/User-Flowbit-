import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { fileUrl, saveUpload } from '@/lib/files'
import { INLINE_IMAGE_TYPES, MAX_INLINE_IMAGES, inlineImageRefusal, type InlineImage } from '@/lib/inline-images'
import { StoredFile } from '@/models/StoredFile'

/** 'comment_image': on a task comment (opens like the task's attachments). 'post_image': on a post or reply (opens like the post). */
export type InlineImageKind = 'comment_image' | 'post_image'
export type ImageRef = { fileId: Types.ObjectId; name: string; mime: string }

/** Stores one image (JPEG, PNG, GIF or WebP, within the upload limit) for a post or comment still being written. */
export async function uploadInlineImage(ctx: Ctx, file: File, opts: { kind: InlineImageKind; entity: string; entityId?: unknown }): Promise<InlineImage> {
  const refusal = inlineImageRefusal({ name: file.name, type: file.type, size: file.size })
  if (refusal) throw new UserError(refusal)
  const stored = await saveUpload(ctx, file, { kind: opts.kind, entity: opts.entity, entityId: opts.entityId, accept: [...INLINE_IMAGE_TYPES] })
  if (!stored) throw new UserError('Choose an image.')
  return { id: String(stored._id), url: fileUrl(stored._id), name: stored.name }
}

/**
 * The images a new post or comment may carry: files of this workspace the
 * same person just uploaded, of the right kind (and for this task). Anything
 * else is refused, so nobody can attach someone else's file by its id.
 */
export async function claimImages(ctx: Ctx, ids: readonly string[], match: { kind: InlineImageKind; entityId?: unknown }): Promise<ImageRef[]> {
  const unique = [...new Set(ids)]
  if (!unique.length) return []
  if (unique.length > MAX_INLINE_IMAGES) throw new UserError(`Up to ${MAX_INLINE_IMAGES} images at a time.`)
  const files = await StoredFile.find(
    { _id: { $in: unique.map((id) => new Types.ObjectId(id)) }, orgId: ctx.orgId, kind: match.kind, uploadedBy: ctx.userId, ...(match.entityId ? { entityId: String(match.entityId) } : {}) },
    { name: 1, mime: 1 },
  ).lean()
  if (files.length !== unique.length) throw new UserError('An image could not be attached. Remove it and add it again.')
  const byId = new Map(files.map((f) => [String(f._id), f]))
  return unique.map((id) => {
    const f = byId.get(id)!
    return { fileId: f._id, name: f.name, mime: f.mime }
  })
}

/** Stored image refs as the page shows them. */
export const imagesView = (refs: readonly { fileId: unknown; name?: string | null }[] | null | undefined): InlineImage[] =>
  (refs ?? []).map((r) => ({ id: String(r.fileId), url: fileUrl(r.fileId), name: r.name ?? 'Image' }))
