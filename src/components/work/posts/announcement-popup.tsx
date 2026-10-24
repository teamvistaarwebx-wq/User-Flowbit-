'use client'

import { usePathname } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import { Megaphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { markPostRead } from '@/modules/work/posts/actions'
import type { PopupAnnouncement } from '@/modules/work/posts/queries'

const DISMISSED_KEY = 'flowbit:announcements-dismissed'
const ACCENT: Record<string, string> = { urgent: 'border-l-4 border-l-[#FF6A66]', high: 'border-l-4 border-l-[#E4BD6D]' }

const noSubscribe = () => () => {}

function readDismissed(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.map(String) : []
  } catch {
    return []
  }
}

function saveDismissed(ids: string[]) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
  } catch {
    // Storage blocked: it shows again on the next page load.
  }
}

/**
 * Unread announcements, one modal at a time (newest first). "Got it" marks it
 * read; closing hides it for this browser session, so it returns next session until read.
 */
export function AnnouncementPopup({ items }: { items: PopupAnnouncement[] }) {
  const [done, setDone] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const pathname = usePathname()
  // sessionStorage exists only in the browser: render nothing on the server and during hydration.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false)
  const dismissed = mounted ? readDismissed() : []
  const queue = mounted ? items.filter((a) => !done.includes(a.id) && !dismissed.includes(a.id)) : []

  // Already reading it: the post page records the read.
  const current = queue.find((a) => pathname !== `/app/work/posts/${a.id}`)
  if (!current) return null
  const next = () => setDone((d) => [...d, current.id])

  const dismiss = () => {
    saveDismissed([...new Set([...readDismissed(), current.id])])
    next()
  }

  const gotIt = async () => {
    setPending(true)
    const res = await markPostRead({ id: current.id })
    setPending(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    next()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : dismiss())}
      className={cn(ACCENT[current.priority])}
      title={
        <span className="flex items-center gap-2">
          <Megaphone className="size-4 shrink-0" strokeWidth={1.5} />
          {current.title}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          {current.author} · Announcement
          {current.priority === 'urgent' ? <Badge tone="danger">Urgent</Badge> : current.priority === 'high' ? <Badge tone="orange">High</Badge> : null}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" href={`/app/work/posts/${current.id}`} onClick={next}>Open post</Button>
          <Button variant="primary" loading={pending} onClick={() => void gotIt()}>Got it</Button>
        </>
      }
    >
      <p className="line-clamp-[12] whitespace-pre-line text-sm text-fg">{current.message}</p>
      {queue.length > 1 ? <p className="mt-3 text-xs text-fg-2">{queue.length - 1} more unread announcement{queue.length === 2 ? '' : 's'}</p> : null}
    </Dialog>
  )
}
