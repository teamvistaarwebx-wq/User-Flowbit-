import { formatDate, formatTime, isoDateIST, timeAgo } from '@/lib/dates'

/** Small pure formatters for settings pages (client-safe). */

/** "Chrome on macOS" from a user-agent string, with simple patterns (no library). */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /node|curl|bot/i.test(ua)
              ? 'Script'
              : 'Browser'
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  return os ? `${browser} on ${os}` : browser
}

export type DayGroup = 'Today' | 'Yesterday' | 'Earlier this week' | 'Earlier'

/** Today / Yesterday / Earlier this week (last 7 days) / Earlier, by IST date. */
export function dayGroup(at: Date | string, now: Date = new Date()): DayGroup {
  const day = isoDateIST(new Date(at))
  const today = isoDateIST(now)
  if (day === today) return 'Today'
  const diff = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000)
  if (diff === 1) return 'Yesterday'
  if (diff > 1 && diff < 7) return 'Earlier this week'
  return 'Earlier'
}

/** Time label that agrees with its day heading: "3 h ago" today, "8:15 pm" yesterday, "28 Sep, 9:12 pm" before. */
export function whenInDayGroup(at: Date | string, now: Date = new Date()): string {
  const group = dayGroup(at, now)
  if (group === 'Today') return timeAgo(at, now)
  if (group === 'Yesterday') return formatTime(at)
  return `${formatDate(new Date(at), { short: true })}, ${formatTime(at)}`
}

/** Groups items (already newest first) under day headings, keeping order. */
export function groupByDay<T extends { createdAt: Date | string }>(items: readonly T[], now: Date = new Date()): { label: DayGroup; items: T[] }[] {
  return items.reduce<{ label: DayGroup; items: T[] }[]>((groups, item) => {
    const label = dayGroup(item.createdAt, now)
    const last = groups[groups.length - 1]
    return last?.label === label ? [...groups.slice(0, -1), { label, items: [...last.items, item] }] : [...groups, { label, items: [item] }]
  }, [])
}

export { formatBytes } from '@/lib/utils'

/** rzp_test_…AbCd: the prefix and the last 4 characters only. */
export function maskKey(key: string): string {
  if (!key) return ''
  const prefix = key.match(/^rzp_(live|test)_/)?.[0] ?? ''
  return `${prefix}…${key.slice(-4)}`
}

export type NotificationArea = 'work' | 'muster' | 'orbit' | 'folio' | 'workspace'

const EVENT_AREA: Record<string, NotificationArea> = {
  task: 'work', meeting: 'work', post: 'work', time: 'work', project: 'work', arc: 'work',
  leave: 'muster', attendance: 'muster', claim: 'muster', payroll: 'muster', payslip: 'muster', letter: 'muster', bank: 'muster', employee: 'muster',
  lead: 'orbit', deal: 'orbit', followup: 'orbit', activity: 'orbit',
  invoice: 'folio', receipt: 'folio', quote: 'folio', retainer: 'folio', collection: 'folio',
  member: 'workspace', subscription: 'workspace', platform: 'workspace',
}

/** The product chip a notification belongs to: its `product`, else the event prefix. */
export function notificationArea(n: { product?: string | null; event?: string | null }): NotificationArea {
  if (n.product === 'work' || n.product === 'muster' || n.product === 'orbit' || n.product === 'folio') return n.product
  const prefix = (n.event ?? '').split('.')[0]
  return EVENT_AREA[prefix] ?? 'workspace'
}

/** Event prefixes for a chip, for the Mongo filter. */
export function eventPrefixesOf(area: NotificationArea): string[] {
  return Object.entries(EVENT_AREA)
    .filter(([, a]) => a === area)
    .map(([prefix]) => prefix)
}

/** "password_reset" → "Password reset", for Outbox kinds. */
export function mailKindLabel(kind: string): string {
  const words = kind.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Email HTML for a sandboxed preview: links open in a new tab instead of inside the frame. */
export function previewHtml(html: string): string {
  const base = '<base target="_blank">'
  return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${html}`
}
