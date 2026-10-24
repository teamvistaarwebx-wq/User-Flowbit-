'use client'

import { BellRing, CheckCircle2, Download } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { DownloadLink } from '@/components/ui/download-link'
import { useAction } from '@/components/ui/action-form'
import { Progress } from '@/components/ui/progress'
import { formatDateTime } from '@/lib/dates'
import { acknowledgePost, remindPendingAcks } from '@/modules/work/posts/engage-actions'
import type { AckRow } from '@/modules/work/posts/acks'

type Ack = { mine: boolean; done: number; total: number }

/** The policy strip on a card: "I've read this" for members, the count for the author. */
export function AckBar({ postId, ack, isAuthor }: { postId: string; ack: Ack; isAuthor: boolean }) {
  const [acknowledge, pending] = useAction(acknowledgePost)
  return (
    <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#E4BD6D]/25 bg-[#E4BD6D]/[0.07] px-3.5 py-2.5">
      <span className="text-[13px] text-white/85">
        {isAuthor ? `${ack.done} of ${ack.total} acknowledged` : ack.mine ? 'You confirmed you have read this.' : 'Please read this policy and confirm.'}
      </span>
      {isAuthor ? null : ack.mine ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2DCBAF]"><CheckCircle2 className="size-4" /> Acknowledged</span>
      ) : (
        <Button size="sm" variant="primary" loading={pending} icon={<CheckCircle2 className="size-4" />} onClick={() => acknowledge({ id: postId })}>I&apos;ve read this</Button>
      )}
    </div>
  )
}

/** Author's view on the post page: who has and has not acknowledged, CSV export and a reminder to the rest. */
export function AckPanel({ postId, rows }: { postId: string; rows: AckRow[] }) {
  const [remind, reminding] = useAction(remindPendingAcks)
  const done = rows.filter((r) => r.ackAt)
  const pending = rows.filter((r) => !r.ackAt)
  const percent = rows.length ? Math.round((done.length / rows.length) * 100) : 0
  return (
    <section className="card-solid rounded-[12px] px-[23px] py-[18px]" aria-labelledby="ack-heading">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ack-heading" className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Acknowledgements · {done.length} of {rows.length}</h2>
        <div className="flex flex-wrap gap-2">
          <DownloadLink className={buttonClass('secondary', 'sm')} href={`/api/work/posts/${postId}/acks`} fallbackName="acknowledgements.csv"><Download className="size-3.5" /> Export CSV</DownloadLink>
          <Button size="sm" variant="secondary" loading={reminding} disabled={!pending.length} icon={<BellRing className="size-3.5" />} onClick={() => remind({ id: postId })}>
            Remind {pending.length} pending
          </Button>
        </div>
      </header>
      <Progress value={percent} tone="success" size="sm" className="mt-3" label={`${percent}% acknowledged`} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <AckList title="Acknowledged" rows={done} />
        <AckList title="Not yet" rows={pending} />
      </div>
    </section>
  )
}

function AckList({ title, rows }: { title: string; rows: AckRow[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-fg-2">{title} · {rows.length}</h3>
      {rows.length ? (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5 text-sm">
              <Avatar name={r.name} size="xs" />
              <span className="min-w-0 flex-1 truncate text-white">{r.name}</span>
              {r.ackAt ? <span className="shrink-0 text-xs text-fg-3">{formatDateTime(r.ackAt)}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-3">Nobody.</p>
      )}
    </div>
  )
}
