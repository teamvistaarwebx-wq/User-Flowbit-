/**
 * The bell's list (notifications-v2 §5, pure): optionally only unread, and
 * grouped by the object an alert is about, so five comments on one task read
 * as "5 updates on 'Homepage copy'". The object is the link the alert opens
 * (its path, without a #comment or ?query); alerts with no link stay alone.
 */

export type BellItem = Readonly<{ id: string; title: string; body?: string | null; href?: string | null; kind: string; createdAt: string; readAt?: string | null }>

export type BellGroup = Readonly<{ key: string; href: string | null; latest: BellItem; ids: readonly string[]; count: number; unread: number }>

export type BellFilter = 'all' | 'unread'

export const objectKey = (href: string | null | undefined): string | null => {
  if (!href || !href.startsWith('/')) return null
  const path = href.split(/[?#]/)[0].replace(/\/+$/, '')
  return path || null
}

/** Groups newest first; within a group the newest alert leads. */
export function groupBell(items: readonly BellItem[], filter: BellFilter = 'all'): BellGroup[] {
  const shown = filter === 'unread' ? items.filter((i) => !i.readAt) : items
  const sorted = [...shown].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const groups = new Map<string, { href: string | null; items: BellItem[] }>()
  for (const item of sorted) {
    const key = objectKey(item.href) ?? `id:${item.id}`
    const group = groups.get(key)
    if (group) group.items.push(item)
    else groups.set(key, { href: item.href ?? null, items: [item] })
  }
  return [...groups.entries()].map(([key, g]) => ({ key, href: g.href, latest: g.items[0], ids: g.items.map((i) => i.id), count: g.items.length, unread: g.items.filter((i) => !i.readAt).length }))
}

/** "5 updates on 'Homepage copy'" for a group, else the alert's own title. */
export function groupTitle(group: BellGroup): string {
  if (group.count === 1) return group.latest.title
  const subject = /'([^']+)'/.exec(group.latest.title)?.[1]
  return subject ? `${group.count} updates on '${subject}'` : `${group.count} updates: ${group.latest.title}`
}
