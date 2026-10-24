import 'server-only'
import { streamStoredFile } from '@/lib/files'

type StoredFileLike = Parameters<typeof streamStoredFile>[0]

export type FileResponseOptions = {
  /** inline opens in the browser; attachment downloads. */
  disposition: 'inline' | 'attachment'
  /** Download name; defaults to the stored name. */
  filename?: string
  cacheControl: string
}

/** `attachment; filename="a_b.pdf"; filename*=UTF-8''a%20b.pdf` (quotes and line breaks never reach the header). */
export function contentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/["\\\r\n]/g, '_').replace(/[^\x20-\x7e]/g, '_')
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/**
 * Streams a stored file from the storage driver (disk or bucket) after the
 * caller's access checks. Null when the bytes are missing from storage.
 */
export async function storedFileResponse(file: StoredFileLike, opts: FileResponseOptions): Promise<Response | null> {
  const object = await streamStoredFile(file)
  if (!object) return null
  const headers: Record<string, string> = {
    'content-type': file.mime || 'application/octet-stream',
    'content-disposition': contentDisposition(opts.disposition, opts.filename ?? file.name),
    'cache-control': opts.cacheControl,
    'x-content-type-options': 'nosniff',
  }
  if (object.size != null) headers['content-length'] = String(object.size)
  return new Response(object.body, { headers })
}
