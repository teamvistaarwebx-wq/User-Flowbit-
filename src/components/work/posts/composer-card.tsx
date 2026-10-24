'use client'

import { useState } from 'react'
import { PenSquare } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import type { GroupOptions } from '@/modules/work/posts/audience'
import { POST_TYPE_META, pickableTypes, type PostType } from '@/modules/work/posts/post-types'
import type { PickPerson } from '../teams/people-picker'
import { PostComposer } from './post-composer'
import { PostTypeIcon } from './post-type-icon'

/** Shortcuts under the collapsed composer: open it straight on that type. */
const SHORTCUTS: readonly PostType[] = ['kudos', 'poll', 'event', 'announcement']

/** Collapsed "Write a post" bar (with type shortcuts) that opens the composer in place. */
export function ComposerCard({ people, groups, canAnnounce, defaultOpen, gifSearch = false, me }: { people: PickPerson[]; groups: GroupOptions; canAnnounce: boolean; defaultOpen?: boolean; gifSearch?: boolean; me?: string }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [type, setType] = useState<PostType | undefined>(undefined)
  const allowed = new Set(pickableTypes(canAnnounce))
  const shortcuts = SHORTCUTS.filter((t) => allowed.has(t) && !POST_TYPE_META[t].automatic)
  const start = (t?: PostType) => {
    setType(t)
    setOpen(true)
  }
  if (!open) {
    return (
      <div className="glass rounded-[16px] p-3 sm:p-4">
        <div className="flex items-center gap-3">
          {me ? <Avatar name={me} size="md" className="hidden shrink-0 sm:inline-flex" /> : null}
          <button type="button" onClick={() => start()} className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-white/[0.14] bg-white/[0.04] px-4 text-left text-sm text-fg-4 transition-colors hover:border-white/[0.28] hover:bg-white/[0.06]">
            <PenSquare className="size-[18px] shrink-0 text-[#AAA9AB]" />
            <span className="truncate">Share an update, kudos, a question or a poll…</span>
          </button>
        </div>
        {shortcuts.length ? (
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] sm:pl-[52px]">
            {shortcuts.map((t) => (
              <button key={t} type="button" onClick={() => start(t)} className="press inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] text-fg-2 transition-colors hover:bg-white/[0.06] hover:text-white">
                <PostTypeIcon type={t} />
                {POST_TYPE_META[t].label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <Card variant="solid" className="animate-scale-in rounded-[16px]">
      <CardHeader label="New post" icon={<PenSquare />} actions={<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button>} />
      <PostComposer people={people} groups={groups} canAnnounce={canAnnounce} gifSearch={gifSearch} initialType={type} onDone={() => setOpen(false)} />
    </Card>
  )
}
