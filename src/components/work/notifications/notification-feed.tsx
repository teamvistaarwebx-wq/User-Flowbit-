'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { CheckCheck, ChevronRight } from 'lucide-react'
import type { IconName } from '@/lib/catalog'
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/lib/core-actions'
import { play } from '@/lib/sound'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export type FeedItem = { id: string; title: string; body: string; href: string; when: string; unread: boolean; problem: boolean; icon: IconName; accentVar: string }

export function MarkAllRead() {
  const [run, pending] = useAction(markAllNotificationsReadAction)
  return (
    <Button variant="secondary" loading={pending} icon={<CheckCheck className="size-4" />} onClick={() => run({})}>
      Mark all read
    </Button>
  )
}

/**
 * One notification as a 56px row: a quiet square with the product's icon, the title (white and semibold while
 * unread, grey once read), one line of detail and the time. Unread is told by weight and a faint lift, never a dot.
 */
function Row({ item }: { item: FeedItem }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const open = () =>
    startTransition(async () => {
      play('click')
      if (item.unread) {
        const result = await markNotificationReadAction({ id: item.id })
        if (!result.ok) toast.error(result.error)
      }
      if (item.href) router.push(item.href)
      else router.refresh()
    })
  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className={cn('group flex min-h-14 w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]', item.unread && 'bg-white/[0.03]', pending && 'opacity-60')}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-control"
        style={{ color: item.unread ? `var(${item.problem ? '--danger' : item.accentVar})` : 'var(--icon-muted)' }}
      >
        <Icon name={item.icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', item.unread ? 'font-semibold text-white' : 'text-white/70')}>{item.title}</span>
        {item.body ? <span className="block truncate text-[13px] text-[#959596]">{item.body}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[13px] tabular-nums text-[#979797]">
        {item.when}
        {item.unread ? <span className="sr-only">Unread</span> : null}
        {item.href ? <ChevronRight className="size-4 text-icon-muted transition-transform duration-150 group-hover:translate-x-0.5" /> : null}
      </span>
    </button>
  )
}

/** Notifications grouped by day, each day an opaque "Assign to me" card with its label in the dashboard style. */
export function NotificationFeed({ groups }: { groups: { label: string; items: FeedItem[] }[] }) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="card-table overflow-hidden">
          <h2 className="border-b border-line px-[23px] pb-3 pt-[15px] text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{g.label}</h2>
          <div className="space-y-0.5 px-2.5 py-2">
            {g.items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
