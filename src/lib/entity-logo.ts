/**
 * Project and client logos, client-safe: JPEG or PNG, resized in the browser
 * to at most LOGO_EDGE pixels on the long side before upload, so the stored
 * file stays small (the server still caps it at LOGO_MAX_BYTES).
 */

export const ENTITY_LOGO_TYPES = ['image/jpeg', 'image/png'] as const
export const ENTITY_LOGO_ACCEPT = ENTITY_LOGO_TYPES.join(',')
export const LOGO_EDGE = 256
export const LOGO_MAX_BYTES = 1024 * 1024

export const isEntityLogoType = (type: string): boolean => (ENTITY_LOGO_TYPES as readonly string[]).includes(type)

/** The size that fits inside `edge` × `edge` keeping the aspect ratio; never scales up. */
export function fitWithin(width: number, height: number, edge: number = LOGO_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: edge, height: edge }
  const scale = Math.min(1, edge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
