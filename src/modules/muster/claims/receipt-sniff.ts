/**
 * Receipt content check (pure): the file's first bytes must match a PDF or an
 * image, whatever type the browser reported. Returns the detected type or null.
 */

const startsWith = (bytes: Uint8Array, sig: readonly number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif'])

export function sniffReceiptType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(bytes, 8, 12))) return 'image/heic'
  return null
}

/** True when the content agrees with the reported type (HEIC and HEIF are one family). */
export function receiptMatches(reported: string, bytes: Uint8Array): boolean {
  const found = sniffReceiptType(bytes)
  if (!found) return false
  const family = (t: string) => (t === 'image/heif' ? 'image/heic' : t)
  return family(found) === family(reported)
}
