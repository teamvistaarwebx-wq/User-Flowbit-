import 'server-only'
import type { Types } from 'mongoose'
import { UserError } from '@/lib/errors'
import { saveFile } from '@/lib/files'
import { sniffPdfImage } from '@/lib/image-bytes'
import { fileTooLargeMessage, MAX_UPLOAD_BYTES } from '@/lib/upload-limit'

type SaveFileCtx = Parameters<typeof saveFile>[0]

export type EntityImageOptions = {
  kind: 'folio_logo' | 'folio_signature'
  entityId?: unknown
  /** Form field the error points at. */
  field: 'logo' | 'signature'
  label: string
  maxBytes?: number
}

/**
 * Saves a Folio entity logo or signature as PNG or JPEG, checked by its first
 * bytes rather than the type the browser claimed (R3 L-24a): the bytes are
 * drawn into every PDF the entity issues. Null when no file was picked.
 */
export async function saveEntityImage(ctx: SaveFileCtx, file: File | null | undefined, opts: EntityImageOptions): Promise<{ _id: Types.ObjectId } | null> {
  if (!file || file.size === 0) return null
  const max = opts.maxBytes ?? MAX_UPLOAD_BYTES
  if (file.size > max) throw new UserError(fileTooLargeMessage(file.name, Math.round((max / 1024 / 1024) * 10) / 10), { [opts.field]: 'Use a smaller image' })
  const data = Buffer.from(await file.arrayBuffer())
  const mime = sniffPdfImage(data)
  if (!mime) throw new UserError(`${opts.label} must be a PNG or JPEG image.`, { [opts.field]: 'PNG or JPEG only' })
  return saveFile(ctx, { name: file.name, mime, data, kind: opts.kind, entity: 'FolioEntity', entityId: opts.entityId })
}
