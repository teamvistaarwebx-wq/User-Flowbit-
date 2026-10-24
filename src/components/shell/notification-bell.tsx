'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { markAllNotificationsReadAction, markNotificationsReadAction } from '@/lib/core-actions'
import { groupBell, groupTitle, type BellFilter, type BellItem } from '@/modules/settings/bell'
import { cn, pluralize } from '@/lib/utils'
import { TimeAgo } from '@/components/ui/time-ago'
import { play } from '@/lib/sound'
import { Popover, PopoverClose } from '@/components/ui/popover'
import { useShell } from './shell-context'

const POLL_MS = 30_000

type Item = BellItem

const MAX_GROUPS = 12

/** Bell with unread count; polls /api/notifications/unread every 30 s and chimes on new items. All / Unread, grouped by the object each alert is about. */
export function NotificationBell() {
  const shell = useShell()
  const [count, setCount] = useState(shell.unread)
  const [items, setItems] = useState<Item[]>([])
  const [filter, setFilter] = useState<BellFilter>('all')
  const last = useRef(shell.unread)
  // The first fetch only syncs the count; a chime is for items that arrive while the page is open.
  const primed = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { count: number; items: Item[] }
      if (primed.current && data.count > last.current) play('notify')
      primed.current = true
      last.current = data.count
      setCount(data.count)
      setItems(data.items)
    } catch {
      // Offline or navigating away; the next poll retries.
    }
  }, [])

  // shell.unread changes when a page marks notifications read and refreshes (the Notifications page):
  // re-fetch then instead of keeping the old count until the next poll.
  useEffect(() => {
    void load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load, shell.unread])

  const markGroup = async (ids: readonly string[]) => {
    const unread = items.filter((i) => ids.includes(i.id) && !i.readAt).length
    if (!unread) return
    const now = new Date().toISOString()
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, readAt: i.readAt ?? now } : i)))
    setCount((c) => Math.max(0, c - unread))
    last.current = Math.max(0, last.current - unread)
    await markNotificationsReadAction({ ids: [...ids] })
  }
  const groups = groupBell(items, filter).slice(0, MAX_GROUPS)

  const markAll = async () => {
    play('toggle')
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })))
    setCount(0)
    last.current = 0
    await markAllNotificationsReadAction({})
  }

  return (
    <Popover
      align="end"
      className="w-[min(360px,calc(100vw-24px))] p-0"
      onOpenChange={(open) => open && void load()}
      trigger={
        <button type="button" className="relative inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-fg transition-colors hover:bg-white/[0.06]" aria-label={count ? pluralize(count, 'unread notification') : 'Notifications'}>
          <Bell className="size-[18px]" strokeWidth={1.5} />
          {/* A number, never a red dot. */}
          {count > 0 ? <span className="text-[13px] font-medium tabular-nums text-fg">{count > 99 ? '99+' : count}</span> : null}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.1] px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">Notifications</span>
          <span className="flex rounded-full bg-white/[0.06] p-0.5 text-xs" role="tablist" aria-label="Show">
            {(['all', 'unread'] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn('rounded-full px-2.5 py-1 transition-colors', filter === f ? 'bg-white/[0.12] text-fg' : 'text-fg-2 hover:text-fg')}>
                {f === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </span>
        </span>
        {count > 0 ? (
          <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-xs text-fg-2 transition-colors hover:text-fg">
            <CheckCheck className="size-3.5" /> Mark all read
          </button>
        ) : null}
      </div>
      <ul className="max-h-[380px] overflow-y-auto p-1.5">
        {groups.length === 0 ? <li className="px-4 py-10 text-center text-sm text-fg-2">{filter === 'unread' ? 'Nothing unread.' : 'You are all caught up.'}</li> : null}
        {groups.map((g) => {
          const n = g.latest
          const read = g.unread === 0
          const body = (
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm', read ? 'text-fg-2' : 'font-medium text-fg')}>{groupTitle(g)}</span>
              {g.count > 1 ? <span className="line-clamp-1 block text-xs text-fg-2">Latest: {n.title}</span> : n.body ? <span className="line-clamp-2 block text-xs text-fg-2">{n.body}</span> : null}
              <TimeAgo value={n.createdAt} className="mt-0.5 block text-[11px] text-fg-3" />
            </span>
          )
          const cls = 'flex w-full gap-2.5 rounded-[7px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]'
          return (
            <li key={g.key}>
              <PopoverClose asChild>
                {g.href ? (
                  <Link href={g.href} className={cls} onClick={() => void markGroup(g.ids)}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" className={cls} onClick={() => void markGroup(g.ids)}>
                    {body}
                  </button>
                )}
              </PopoverClose>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-2 gap-1 border-t border-white/[0.1] p-1.5">
        <PopoverClose asChild>
          <Link href="/app/notifications" className="block rounded-[7px] px-3 py-2 text-center text-[13px] text-fg hover:bg-white/[0.06]">
            View all notifications
          </Link>
        </PopoverClose>
        <PopoverClose asChild>
          <Link href="/app/approvals" className="block rounded-[7px] px-3 py-2 text-center text-[13px] text-fg hover:bg-white/[0.06]">
            Approvals
          </Link>
        </PopoverClose>
      </div>
    </Popover>
  )
}
