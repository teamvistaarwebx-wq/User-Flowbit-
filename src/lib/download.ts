/**
 * Reading a file download response in the browser (pure helpers for
 * components/ui/download-link). A refused or failed export must become a toast,
 * not a page of raw JSON (R2 15.2).
 */

export const DOWNLOAD_FAILED = 'The download did not work. Try again in a moment.'
const MAX_PLAIN_ERROR = 200

/** The file name from `attachment; filename="a.csv"; filename*=UTF-8''a.csv`, or the fallback. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim())
    } catch {
      // A malformed encoded name falls through to the plain one.
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? /filename=([^;]+)/i.exec(header)?.[1]?.trim() ?? fallback
}

/** The user-facing message for a refused download: the route's `{ error }`, a short plain-text reason, or a generic line. */
export function downloadErrorMessage(contentType: string | null, body: string): string {
  const type = contentType ?? ''
  if (type.includes('json')) {
    try {
      const parsed: unknown = JSON.parse(body)
      const error = parsed && typeof parsed === 'object' && 'error' in parsed ? (parsed as { error: unknown }).error : null
      return typeof error === 'string' && error.trim() ? error : DOWNLOAD_FAILED
    } catch {
      return DOWNLOAD_FAILED
    }
  }
  const text = body.trim()
  if (type.includes('text/plain') && text && text.length <= MAX_PLAIN_ERROR) return text === 'Not allowed' ? "You don't have permission to download this." : text
  return DOWNLOAD_FAILED
}
