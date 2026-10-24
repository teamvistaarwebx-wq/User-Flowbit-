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

export type NotificationItem = { id: string; title: string; body: string; href: string; when: string; unread: boolean; problem: boolean; icon: IconName; accentVar: string }

export function MarkAllReadButton() {
  const [run, pending] = useAction(markAllNotificationsReadAction)
  return (
    <Button variant="secondary" loading={pending} icon={<CheckCheck className="size-4" />} onClick={() => run({})}>
      Mark all read
    </Button>
  )
}

function Row({ item }: { item: NotificationItem }) {
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
    <button type="button" onClick={open} disabled={pending} className={cn('flex w-full items-start gap-3 px-[23px] py-2.5 text-left transition-colors hover:bg-white/[0.04]', pending && 'opacity-60')}>
      <Icon name={item.icon} className={cn('mt-0.5 size-4 shrink-0', item.unread ? 'text-white' : 'text-icon-muted')} strokeWidth={1.5} style={item.unread && item.problem ? { color: '#FF6A66' } : undefined} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', item.unread ? 'font-medium text-white' : 'text-white/70')}>{item.title}</span>
        {item.body ? <span className="block truncate text-xs text-[#959596]">{item.body}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-[#979797]">
        {item.when}
        {item.unread ? <span className="sr-only">Unread</span> : null}
        {item.href ? <ChevronRight className="size-4" /> : null}
      </span>
    </button>
  )
}

/** Notifications grouped by day; clicking marks read and follows the link. */
export function NotificationList({ groups }: { groups: { label: string; items: NotificationItem[] }[] }) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="section-label mb-2 px-1">{g.label}</h2>
          <div className="card-table overflow-hidden py-1.5">
            {g.items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
