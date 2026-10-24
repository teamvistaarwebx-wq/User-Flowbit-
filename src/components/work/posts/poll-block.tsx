'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAction } from '@/components/ui/action-form'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { closePoll, votePoll } from '@/modules/work/posts/engage-actions'
import type { PollView } from '@/modules/work/posts/polls'

type Props = { postId: string; poll: PollView; canVote: boolean; canClose: boolean }

/**
 * A poll on a post: pick one (radio) or several (checkbox) options and vote; results show as bars once you
 * have voted or the poll has closed. Live: every vote revalidates the post. Anonymous polls never show names.
 */
export function PollBlock({ postId, poll, canVote, canClose }: Props) {
  const [picked, setPicked] = useState<string[]>(poll.mine)
  const [editing, setEditing] = useState(poll.mine.length === 0)
  const [vote, voting] = useAction(votePoll, { onDone: () => setEditing(false) })
  const [close, closing] = useAction(closePoll)
  const showResults = poll.closed || !canVote || !editing
  const toggle = (key: string) => setPicked((cur) => (poll.multiple ? (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]) : [key]))
  // Names come back only for polls that are not anonymous.
  const votersShown = !poll.anonymous && poll.options.some((o) => o.names.length > 0)
  const status = [
    `${poll.voters} ${poll.voters === 1 ? 'vote' : 'votes'}`,
    poll.multiple ? 'Pick any' : 'Pick one',
    poll.anonymous ? 'Anonymous' : null,
    poll.closed ? 'Closed' : poll.closesAt ? `Closes ${formatDate(poll.closesAt.slice(0, 10))}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <fieldset className="relative z-10 mt-4 space-y-2" aria-busy={voting || undefined}>
      <legend className="sr-only">Poll options</legend>
      {poll.options.map((o) =>
        showResults ? (
          <div key={o.key} className="relative overflow-hidden rounded-[10px] border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5">
            <span aria-hidden className={cn('absolute inset-y-0 left-0 transition-[width] duration-500', poll.mine.includes(o.key) ? 'bg-orchid/35' : 'bg-white/[0.07]')} style={{ width: `${o.percent}%` }} />
            <span className="relative flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-white">
                {poll.mine.includes(o.key) ? <Check className="size-3.5 shrink-0 text-link" aria-label="Your vote" /> : null}
                <span className="truncate">{o.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-fg-2">{o.percent}% · {o.votes}</span>
            </span>
          </div>
        ) : (
          <label key={o.key} className={cn('press flex cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-sm transition-colors', picked.includes(o.key) ? 'border-orchid/60 bg-orchid/15 text-white' : 'border-white/[0.12] bg-white/[0.03] text-white/85 hover:border-white/25')}>
            <input type={poll.multiple ? 'checkbox' : 'radio'} name={`poll-${postId}`} value={o.key} checked={picked.includes(o.key)} onChange={() => toggle(o.key)} className="size-4 accent-orchid" />
            {o.label}
          </label>
        ),
      )}
      {showResults && votersShown ? (
        <details className="group text-xs">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center rounded-full text-fg-2 hover:text-fg [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">See who voted</span>
            <span className="hidden group-open:inline">Hide voters</span>
          </summary>
          <dl className="mt-1 space-y-1.5">
            {poll.options.filter((o) => o.names.length).map((o) => (
              <div key={o.key}>
                <dt className="font-medium text-white">{o.label}</dt>
                <dd className="text-fg-2">{o.names.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-xs text-fg-3">{status}</span>
        <div className="flex flex-wrap gap-2">
          {canVote && !poll.closed && !editing ? <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Change vote</Button> : null}
          {canVote && !poll.closed && editing ? (
            <Button size="sm" variant="secondary" loading={voting} disabled={!picked.length} onClick={() => vote({ id: postId, keys: picked })}>Vote</Button>
          ) : null}
          {canClose && !poll.closed ? <Button size="sm" variant="ghost" loading={closing} onClick={() => close({ id: postId })}>Close poll</Button> : null}
        </div>
      </div>
    </fieldset>
  )
}
