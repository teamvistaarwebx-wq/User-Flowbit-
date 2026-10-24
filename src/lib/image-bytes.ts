/**
 * Image checks that need no image library (pure, client-safe). PDFs can only draw PNG and JPEG, so the
 * company logo, signatures and seals are stored as one of those, checked by their first bytes rather
 * than the type the browser claimed.
 */

export type PdfImageType = 'image/png' | 'image/jpeg'

export const PDF_IMAGE_TYPES: readonly PdfImageType[] = ['image/png', 'image/jpeg']

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_MAGIC = [0xff, 0xd8, 0xff]

const startsWith = (bytes: Uint8Array, magic: number[]) => bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b)

/** The real type of a PNG or JPEG from its first bytes; null for anything else. */
export function sniffPdfImage(bytes: Uint8Array): PdfImageType | null {
  if (startsWith(bytes, PNG_MAGIC)) return 'image/png'
  if (startsWith(bytes, JPEG_MAGIC)) return 'image/jpeg'
  return null
}

/** The brightness (0–255) at or above which "Remove background" clears a pixel by default. */
export const DEFAULT_BACKGROUND_THRESHOLD = 225

/**
 * A copy of RGBA pixels with every light pixel made transparent: a signature scanned on white paper
 * becomes ink on a clear background. A pixel is cleared when its red, green and blue are all at or
 * above `threshold`; the input is not changed.
 */
export function clearLightPixels(rgba: Uint8ClampedArray, threshold: number = DEFAULT_BACKGROUND_THRESHOLD): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba)
  for (let i = 0; i + 3 < out.length; i += 4) {
    if (out[i] >= threshold && out[i + 1] >= threshold && out[i + 2] >= threshold) out[i + 3] = 0
  }
  return out
}
