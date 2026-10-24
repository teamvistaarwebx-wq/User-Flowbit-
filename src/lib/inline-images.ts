import { fileTooLargeMessage, MAX_UPLOAD_BYTES } from '@/lib/upload-limit'

/**
 * Images and GIFs inline in posts, replies and task comments, client-safe.
 * Each file goes up on its own request (the upload limit is per request,
 * 4 MB on Vercel) and is stored like any attachment; the post or comment
 * then carries the file ids. No SVG: it can carry script.
 */

export const INLINE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
export const INLINE_IMAGE_ACCEPT = INLINE_IMAGE_TYPES.join(',')
/** Images per post, reply or comment. */
export const MAX_INLINE_IMAGES = 4

/** A shown image: its file link and name. */
export type InlineImage = Readonly<{ id: string; url: string; name: string }>

/** Why a picked file cannot go up (type, size, or already `count` images), or null. */
export function inlineImageRefusal(file: Readonly<{ name: string; type: string; size: number }>, count = 0, maxBytes = MAX_UPLOAD_BYTES): string | null {
  if (count >= MAX_INLINE_IMAGES) return `Up to ${MAX_INLINE_IMAGES} images at a time.`
  if (!(INLINE_IMAGE_TYPES as readonly string[]).includes(file.type)) return `"${file.name}" is not a JPEG, PNG, GIF or WebP image.`
  if (file.size > maxBytes) return fileTooLargeMessage(file.name, Math.round((maxBytes / 1024 / 1024) * 10) / 10)
  return null
}
