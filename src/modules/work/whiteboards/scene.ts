import { z } from 'zod'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limit'

/**
 * Refuse saves over ~8 MB so the document stays well under MongoDB's 16 MB
 * limit, and over the upload cap, which on Vercel matches its ~4.5 MB body limit.
 */
export const MAX_SCENE_BYTES = Math.min(8 * 1024 * 1024, MAX_UPLOAD_BYTES)
export const MAX_THUMBNAIL_BYTES = 200 * 1024
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

const fileRef = z.object({
  mimeType: z.string().max(100),
  /** Already stored: the StoredFile id. */
  fileId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  /** New image pasted into the board: base64 data URL, stored on save. */
  dataURL: z.string().startsWith('data:').optional(),
})

export const saveSchema = z.object({
  version: z.number().int().min(0),
  elements: z.array(z.record(z.string(), z.unknown())).max(20000),
  appState: z.record(z.string(), z.unknown()).default({}),
  files: z.record(z.string(), fileRef).default({}),
  thumbnail: z.string().startsWith('data:image/svg+xml').max(MAX_THUMBNAIL_BYTES).optional(),
})
export type SavePayload = z.infer<typeof saveSchema>

/**
 * Default canvas colour. Excalidraw's dark theme inverts the canvas with a CSS filter, so white
 * renders as the near-black board; a dark value here would come out light grey.
 */
export const BOARD_BACKGROUND = '#ffffff'

/** Only the view settings worth keeping; the editor always opens dark. */
export function pickAppState(appState: Record<string, unknown>): { viewBackgroundColor: string; gridSize: number | null; theme: 'dark' } {
  const bg = typeof appState.viewBackgroundColor === 'string' && /^#[0-9a-fA-F]{3,8}$|^transparent$/.test(appState.viewBackgroundColor) ? appState.viewBackgroundColor : BOARD_BACKGROUND
  const grid = typeof appState.gridSize === 'number' && appState.gridSize > 0 && appState.gridSize <= 100 ? appState.gridSize : null
  return { viewBackgroundColor: bg, gridSize: grid, theme: 'dark' }
}

/** Ids of image files the elements still reference (unused files are dropped on save). */
export function referencedFileIds(elements: Record<string, unknown>[]): Set<string> {
  return new Set(elements.filter((e) => e.type === 'image' && typeof e.fileId === 'string' && !e.isDeleted).map((e) => e.fileId as string))
}

/** Decodes a data URL into its mime type and bytes, or null when malformed. */
export function decodeDataUrl(dataURL: string): { mime: string; data: Buffer } | null {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataURL)
  if (!match) return null
  return { mime: match[1], data: Buffer.from(match[2], 'base64') }
}
