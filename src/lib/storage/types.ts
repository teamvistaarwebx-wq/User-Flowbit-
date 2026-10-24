/**
 * Where uploaded and generated files live. Keys are the `StoredFile.path`
 * values (`<orgId>/<yyyy-mm>/<id>-<name>`), the same for every driver, so
 * files can move between drivers without touching the database.
 */
export type StorageDriverName = 'local' | 's3'

export type StoredObjectStream = {
  body: ReadableStream<Uint8Array>
  /** Byte length when the driver knows it. */
  size?: number
}

export interface StorageDriver {
  readonly name: StorageDriverName
  put(key: string, data: Buffer, mime: string): Promise<void>
  /** The bytes, or null when no object has this key. */
  get(key: string): Promise<Buffer | null>
  /** A stream of the bytes for responses, or null when no object has this key. */
  stream(key: string): Promise<StoredObjectStream | null>
  /** Removes the object; a missing key is not an error. */
  delete(key: string): Promise<void>
  /** True when an object has this key. */
  exists(key: string): Promise<boolean>
  /** Byte length of the object, or null when no object has this key. */
  size(key: string): Promise<number | null>
}

/** Storage keys always use forward slashes, whatever the OS wrote into StoredFile.path. */
export const normaliseKey = (key: string): string => key.replace(/\\/g, '/').replace(/^\/+/, '')

/** Segments no storage key may hold: a key is a plain path, never a relative one. */
const UNSAFE_SEGMENTS = new Set(['', '.', '..'])

/**
 * The normalised key, after refusing anything that could point at another
 * object than it names: `.` or `..` segments, empty segments (`a//b`), NUL.
 * Every driver goes through this, so no key can climb out of its folder.
 */
export function safeKey(key: string): string {
  const normalised = normaliseKey(key)
  if (!normalised || normalised.includes('\0') || normalised.split('/').some((segment) => UNSAFE_SEGMENTS.has(segment))) {
    throw new Error(`Unsafe storage key: ${key}`)
  }
  return normalised
}
