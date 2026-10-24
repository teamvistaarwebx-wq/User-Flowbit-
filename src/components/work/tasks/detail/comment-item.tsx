'use client'

import { Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { deleteComment, editComment, toggleReaction } from '@/modules/work/tasks/comment-actions'
import { COMMENT_REACTIONS } from '@/modules/work/tasks/constants'
import { TimeAgo } from '@/components/ui/time-ago'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Popover } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/input'
import { useTaskData } from '../task-data'
import type { InlineImage } from '@/lib/inline-images'
import { ImageGallery } from '../../media/image-gallery'

/** `sending`: shown before the server has saved it (activity-panel's optimistic list). */
export type CommentRow = { id: string; authorId: string; body: string; parentId: string | null; mentionIds: string[]; reactions: { emoji: string; memberId: string }[]; editedAt: string | null; createdAt: string; sending?: boolean; images?: InlineImage[] }

/** Comment text with @mentions of real people highlighted. */
function Body({ text, mentionIds }: { text: string; mentionIds: string[] }) {
  const { nameOf } = useTaskData()
  const names = mentionIds.map(nameOf).filter((n) => n !== 'Someone').sort((a, b) => b.length - a.length)
  if (!names.length) return <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{text}</p>
  const pattern = new RegExp(`(${names.map((n) => `@${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('|')})`, 'g')
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
      {text.split(pattern).map((part, i) => (names.some((n) => part === `@${n}`) ? <span key={i} className="font-medium text-link">{part}</span> : <Fragment key={i}>{part}</Fragment>))}
    </p>
  )
}

/** One comment: reactions, reply, edit (author), delete (author or tasks.manage). */
export function CommentItem({ comment, onReply, compact }: { comment: CommentRow; onReply?: () => void; compact?: boolean }) {
  const data = useTaskData()
  const [react] = useAction(toggleReaction)
  const [save, saving] = useAction(editComment)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const mine = comment.authorId === data.me
  const groups = COMMENT_REACTIONS.map((emoji) => ({ emoji, members: comment.reactions.filter((r) => r.emoji === emoji).map((r) => r.memberId) })).filter((g) => g.members.length)

  return (
    <div id={`comment-${comment.id}`} aria-busy={comment.sending || undefined} className={cn('flex gap-3 scroll-mt-24', compact && 'gap-2.5', comment.sending && 'opacity-60')}>
      <Avatar name={data.nameOf(comment.authorId)} src={data.person(comment.authorId)?.avatarUrl} size={compact ? 'xs' : 'sm'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <span className="font-semibold text-white">{data.nameOf(comment.authorId)}</span>
          {comment.sending ? <span className="text-xs text-[#979797]">Sending…</span> : <TimeAgo value={comment.createdAt} title className="text-xs text-[#979797]" />}
          {comment.editedAt ? <span className="text-xs text-[#979797]">· edited</span> : null}
        </div>
        {editing ? (
          <div className="mt-1.5 space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Edit comment" />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" loading={saving} onClick={async () => (await save({ id: comment.id, body: draft })).ok && setEditing(false)}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setDraft(comment.body); setEditing(false) }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-1"><Body text={comment.body} mentionIds={comment.mentionIds} /></div>
        )}
        {comment.images?.length ? <ImageGallery images={comment.images} size="sm" className="mt-2" author={data.nameOf(comment.authorId)} source="comment" /> : null}
        {comment.sending ? null : <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {groups.map((g) => (
            <button key={g.emoji} type="button" onClick={() => void react({ id: comment.id, emoji: g.emoji })} title={g.members.map(data.nameOf).join(', ')} className={cn('press inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors', g.members.includes(data.me) ? 'border-transparent bg-chip-active text-white' : 'border-white/[0.12] bg-control text-fg-2 hover:border-white/25')}>
              {g.emoji} {g.members.length}
            </button>
          ))}
          <Popover trigger={<button type="button" aria-label="Add reaction" className="hit-area relative rounded-full p-1 text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-white"><SmilePlus className="size-3.5" /></button>} className="w-auto p-1.5">
            <div className="flex gap-0.5">
              {COMMENT_REACTIONS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => void react({ id: comment.id, emoji })} className="rounded-lg p-1.5 text-base transition-colors hover:bg-white/[0.06]">{emoji}</button>
              ))}
            </div>
          </Popover>
          {onReply ? <button type="button" onClick={onReply} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-white"><Reply className="size-3" />Reply</button> : null}
          {mine && !editing ? <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-white"><Pencil className="size-3" />Edit</button> : null}
          {mine || data.canManage ? (
            <ConfirmDialog
              trigger={<button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-[#FF6A66]"><Trash2 className="size-3" />Delete</button>}
              title="Delete this comment?"
              description={comment.parentId ? undefined : 'Replies to it are deleted too.'}
              confirmLabel="Delete"
              onConfirm={() => deleteComment({ id: comment.id })}
            />
          ) : null}
        </div>}
      </div>
    </div>
  )
}
