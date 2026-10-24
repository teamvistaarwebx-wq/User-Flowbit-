/**
 * Server-built storage keys: `<orgId>/<yyyy-mm>/<id>-<safeName>`. Pure, so the
 * rules that keep one workspace's key from naming another's file are tested
 * without a database or a disk.
 */

const NAME_TAIL = 80
const MONTH_LENGTH = 7

/** The file name as it may appear in a key: letters, digits, dot, underscore, hyphen. */
export const safeName = (name: string): string => name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-NAME_TAIL) || 'file'

const monthOf = (at: Date): string => at.toISOString().slice(0, MONTH_LENGTH)

/** Storage key for a new file: <orgId>/<yyyy-mm>/<id>-<name>. */
export function storedFileKey(orgId: unknown, id: unknown, name: string, at: Date = new Date()): string {
  return `${String(orgId)}/${monthOf(at)}/${String(id)}-${safeName(name)}`
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * True only for an exact server-shaped key of this org and this file id:
 * `^<orgId>/\d{4}-\d{2}/<fileId>-[A-Za-z0-9._-]+$`, with no `..`, `\` or `//`.
 */
export function isStoredFileKeyFor(orgId: unknown, id: unknown, key: string): boolean {
  if (key.includes('..') || key.includes('\\') || key.includes('//')) return false
  const pattern = new RegExp(`^${escapeRegex(String(orgId))}/\\d{4}-\\d{2}/${escapeRegex(String(id))}-[A-Za-z0-9._-]+$`)
  return pattern.test(key)
}

/**
 * The keys a direct upload signed for this file can have: this month's, or
 * last month's when the upload was signed just before the month turned. Built
 * on the server from the file id and name, never taken from the browser.
 */
export function directUploadKeys(orgId: unknown, id: unknown, name: string, now: Date = new Date()): string[] {
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return [...new Set([storedFileKey(orgId, id, name, now), storedFileKey(orgId, id, name, lastMonth)])]
}
