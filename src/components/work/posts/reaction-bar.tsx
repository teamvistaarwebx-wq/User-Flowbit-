'use client'

import { SmilePlus } from 'lucide-react'
import { Popover, PopoverClose } from '@/components/ui/popover'
import { useAction } from '@/components/ui/action-form'
import { cn } from '@/lib/utils'
import { reactToPost } from '@/modules/work/posts/actions'
import { reactToReply } from '@/modules/work/posts/reply-actions'
import { REACTION_EMOJIS } from '@/modules/work/posts/rules'

type Emoji = (typeof REACTION_EMOJIS)[number]

/** Reaction chips plus a picker with the quick set. */
export function ReactionBar({ kind, id, reactions }: { kind: 'post' | 'reply'; id: string; reactions: { emoji: string; count: number; mine: boolean }[] }) {
  const [reactPost, postPending] = useAction(reactToPost)
  const [reactReply, replyPending] = useAction(reactToReply)
  const pending = postPending || replyPending
  const toggle = (emoji: string) => (kind === 'post' ? reactPost({ id, emoji: emoji as Emoji }) : reactReply({ id, emoji: emoji as Emoji }))
  return (
    <div className="relative z-10 flex flex-wrap items-center gap-1.5" aria-busy={pending || undefined}>
      {reactions.map((r) => (
        <button key={r.emoji} type="button" onClick={() => toggle(r.emoji)} aria-pressed={r.mine} className={cn('hit-area press relative inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors', r.mine ? 'border-transparent bg-chip-active text-white' : 'border-white/[0.12] bg-control text-fg-2 hover:border-white/25')}>
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
      <Popover
        className="w-auto p-2"
        trigger={
          <button type="button" aria-label="Add reaction" className="hit-area press relative inline-flex size-7 items-center justify-center rounded-full border border-white/[0.12] bg-control text-fg-3 transition-colors hover:border-white/25 hover:text-white">
            <SmilePlus className="size-3.5" />
          </button>
        }
      >
        <div className="flex gap-1">
          {REACTION_EMOJIS.map((e) => (
            <PopoverClose asChild key={e}>
              <button type="button" onClick={() => toggle(e)} className="press flex size-9 items-center justify-center rounded-lg text-lg transition-colors hover:bg-white/[0.06]" aria-label={`React ${e}`}>
                {e}
              </button>
            </PopoverClose>
          ))}
        </div>
      </Popover>
    </div>
  )
}
