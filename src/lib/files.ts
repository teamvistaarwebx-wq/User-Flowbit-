import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { storage } from '@/lib/storage'
import { isStoredFileKeyFor, storedFileKey } from '@/lib/storage/keys'
import { fileTooLargeMessage, MAX_UPLOAD_BYTES } from '@/lib/upload-limit'
import { Member } from '@/models/Member'
import { StoredFile } from '@/models/StoredFile'

export { MAX_UPLOAD_BYTES } from '@/lib/upload-limit'
/** No SVG: an uploaded SVG served from our origin can carry script. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']

/** Generated files (payslip, letter and invoice PDFs) may exceed the upload cap; they never travel in a request body. */
const MAX_STORED_BYTES = 25 * 1024 * 1024

export type SaveFileInput = {
  name: string
  mime: string
  data: Buffer
  /** 'avatar' | 'logo' | 'document' | 'receipt' | 'attachment' | 'pdf' | ... */
  kind: string
  entity?: string
  entityId?: unknown
  /** Overrides the 25 MB ceiling (meeting recordings). */
  maxBytes?: number
}

type FileCtx = Pick<Ctx, 'orgId' | 'userId'>

/**
 * Stores bytes under the key <orgId>/<yyyy-mm>/<id>-<name> with the storage
 * driver (local disk or bucket) and records a StoredFile.
 */
export async function saveFile(ctx: FileCtx, input: SaveFileInput) {
  if (input.data.length > (input.maxBytes ?? MAX_STORED_BYTES)) throw new UserError('This file is too large to store.')
  const id = new Types.ObjectId()
  const relative = storedFileKey(ctx.orgId, id, input.name)
  const mime = input.mime || 'application/octet-stream'
  await storage().put(relative, input.data, mime)
  const doc = await StoredFile.create({
    _id: id,
    orgId: ctx.orgId,
    name: input.name,
    mime,
    size: input.data.length,
    path: relative,
    kind: input.kind,
    entity: input.entity,
    entityId: input.entityId == null ? undefined : String(input.entityId),
    uploadedBy: ctx.userId,
  })
  return doc.toObject()
}

/** Storage key for a new file: <orgId>/<yyyy-mm>/<id>-<name> (direct uploads sign a PUT to it first). */
export { storedFileKey }

/**
 * Records a StoredFile for bytes the browser already put in the bucket
 * (presigned upload); null when they are not there. The key must be built by
 * the server (see directUploadKeys) and is checked again here, exactly. The
 * size stored is the object's real size: over `maxBytes` the object is
 * deleted and the upload refused, whatever the browser declared.
 */
export async function registerUploadedFile(ctx: FileCtx, input: { id: Types.ObjectId; key: string; name: string; mime: string; kind: string; maxBytes: number; entity?: string; entityId?: unknown }) {
  if (!isStoredFileKeyFor(ctx.orgId, input.id, input.key)) return null
  const size = await storage().size(input.key)
  if (size == null) return null
  if (size > input.maxBytes) {
    await storage().delete(input.key).catch((error) => console.error('[files] could not delete an oversized upload', input.key, error))
    throw new UserError(fileTooLargeMessage(input.name, Math.round((input.maxBytes / 1024 / 1024) * 10) / 10))
  }
  const doc = await StoredFile.create({ _id: input.id, orgId: ctx.orgId, name: input.name, mime: input.mime || 'application/octet-stream', size, path: input.key, kind: input.kind, entity: input.entity, entityId: input.entityId == null ? undefined : String(input.entityId), uploadedBy: ctx.userId })
  return doc.toObject()
}

/**
 * Saves a File from FormData after checking size and type.
 * Returns null when the field was left empty.
 */
export async function saveUpload(
  ctx: FileCtx,
  file: File | null | undefined,
  opts: { kind: string; entity?: string; entityId?: unknown; accept?: string[]; maxBytes?: number },
) {
  if (!file || file.size === 0) return null
  const max = opts.maxBytes ?? MAX_UPLOAD_BYTES
  if (file.size > max) throw new UserError(fileTooLargeMessage(file.name, Math.round((max / 1024 / 1024) * 10) / 10))
  if (opts.accept && !opts.accept.includes(file.type)) throw new UserError(`"${file.name}" is not an accepted file type.`)
  const data = Buffer.from(await file.arrayBuffer())
  return saveFile(ctx, { name: file.name, mime: file.type, data, kind: opts.kind, entity: opts.entity, entityId: opts.entityId })
}

type StoredFileRecord = NonNullable<Awaited<ReturnType<typeof findStoredFile>>>

/** The StoredFile record of the given org (no bytes); null when missing. */
export async function findStoredFile(orgId: Types.ObjectId, id: string) {
  if (!Types.ObjectId.isValid(id)) return null
  return StoredFile.findOne({ _id: id, orgId }).lean()
}

/** Reads a stored file of the given org into memory (PDF logos, mail attachments); null when missing. */
export async function readStoredFile(orgId: Types.ObjectId, id: string) {
  const file = await findStoredFile(orgId, id)
  if (!file) return null
  const data = await storage().get(file.path)
  if (!data) {
    console.error('[files] stored bytes are missing for', id, 'driver', storage().name)
    return null
  }
  return { file, data }
}

/** Opens a stored file as a stream for a response; null when its bytes are missing. */
export async function streamStoredFile(file: StoredFileRecord) {
  const object = await storage().stream(file.path)
  if (!object) console.error('[files] stored bytes are missing for', String(file._id), 'driver', storage().name)
  return object
}

/**
 * Reads an avatar ('avatar' kind) uploaded in another workspace, when the
 * viewer shares at least one active workspace with the person who uploaded it.
 * Lets a profile photo set in workspace A show in workspace B.
 */
export async function findSharedAvatar(viewerUserId: Types.ObjectId, id: string) {
  if (!Types.ObjectId.isValid(id)) return null
  const file = await StoredFile.findOne({ _id: id, kind: 'avatar' }).lean()
  if (!file?.uploadedBy) return null
  const viewerOrgs = await Member.distinct('orgId', { userId: viewerUserId, status: 'active' })
  const shared = await Member.exists({ userId: file.uploadedBy, status: 'active', orgId: { $in: viewerOrgs } })
  return shared ? file : null
}

/**
 * Reads a workspace logo ('logo' kind) of another workspace the viewer is an
 * active member of, so the workspace switcher can show every workspace's logo.
 */
export async function findMemberWorkspaceLogo(viewerUserId: Types.ObjectId, id: string) {
  if (!Types.ObjectId.isValid(id)) return null
  const file = await StoredFile.findOne({ _id: id, kind: 'logo' }).lean()
  if (!file) return null
  const member = await Member.exists({ userId: viewerUserId, orgId: file.orgId, status: 'active' })
  return member ? file : null
}

export async function deleteStoredFile(orgId: Types.ObjectId, id: string): Promise<void> {
  const file = await StoredFile.findOneAndDelete({ _id: id, orgId }).lean()
  if (!file) return
  await storage().delete(file.path).catch((error) => console.error('[files] delete failed', id, error))
}

/** URL that streams the file (org-checked): /api/files/<id>. Add ?download=1 to force download. */
export const fileUrl = (id: unknown, opts: { download?: boolean } = {}) =>
  `/api/files/${String(id)}${opts.download ? '?download=1' : ''}`
