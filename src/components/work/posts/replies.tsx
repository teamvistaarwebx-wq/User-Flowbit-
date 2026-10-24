'use client'

import { useCallback, useState, type FormEvent } from 'react'
import { Pencil, Reply, Trash2 } from 'lucide-react'
import { ActionForm, SubmitButton, useAction } from '@/components/ui/action-form'
import { useOptimisticList } from '@/components/ui/use-optimistic-list'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/input'
import { TimeAgo } from '@/components/ui/time-ago'
import { createReply, deleteReply, updateReply } from '@/modules/work/posts/reply-actions'
import { PeoplePicker, type PickPerson } from '../teams/people-picker'
import { ReactionBar } from './reaction-bar'
import type { InlineImage } from '@/lib/inline-images'
import { uploadPostImage } from '@/modules/work/posts/image-actions'
import { ImageGallery } from '../media/image-gallery'
import { ImageDraftStrip, ImagePickButton } from '../media/image-draft'
import { useImageUploads } from '../media/use-image-uploads'

export type ReplyRow = { id: string; author: string; body: string; createdAt: string; edited: boolean; mine: boolean; reactions: { emoji: string; count: number; mine: boolean }[]; images: InlineImage[] }

function ReplyItem({ reply, canModerate }: { reply: ReplyRow & { sending?: boolean }; canModerate: boolean }) {
  const [editing, setEditing] = useState(false)
  return (
    <li aria-busy={reply.sending || undefined} className={cn('flex gap-3 rounded-[10px] px-2 py-3 transition-colors hover:bg-white/[0.03]', reply.sending && 'opacity-60')}>
      <Avatar name={reply.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{reply.author}</span>
          <span className="text-xs text-[#979797]">{reply.sending ? 'Sending…' : <><TimeAgo value={reply.createdAt} />{reply.edited ? ' · edited' : ''}</>}</span>
          {reply.sending ? null : <span className="ml-auto flex items-center">
            {reply.mine ? <IconButton label="Edit reply" size="sm" onClick={() => setEditing(!editing)}><Pencil className="size-4" /></IconButton> : null}
            {reply.mine || canModerate ? (
              <ConfirmDialog trigger={<IconButton label="Remove reply" size="sm"><Trash2 className="size-4" /></IconButton>} title="Remove this reply?" confirmLabel="Remove" onConfirm={() => deleteReply({ id: reply.id })} />
            ) : null}
          </span>}
        </div>
        {editing ? (
          <ActionForm action={updateReply} onDone={() => setEditing(false)} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={reply.id} />
            <Textarea name="body" defaultValue={reply.body} rows={3} maxLength={5000} aria-label="Reply" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <SubmitButton size="sm">Save</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{reply.body}</p>
        )}
        {reply.images.length ? <ImageGallery images={reply.images} size="sm" className="mt-2" author={reply.author} source="reply" /> : null}
        {reply.sending ? null : <div className="mt-2">
          <ReactionBar kind="reply" id={reply.id} reactions={reply.reactions} />
        </div>}
      </div>
    </li>
  )
}

/** Replies with an optimistic composer: a reply shows at once as "Sending…" and is rolled back if the save fails. */
export function Replies({ postId, replies, people, canModerate, meName }: { postId: string; replies: ReplyRow[]; people: PickPerson[]; canModerate: boolean; meName: string }) {
  const [mentions, setMentions] = useState<string[]>([])
  const [body, setBody] = useState('')
  const [post] = useAction(createReply)
  const { rows, send } = useOptimisticList(replies)
  const images = useImageUploads(useCallback((file: File) => {
    const form = new FormData()
    form.set('file', file)
    return uploadPostImage(form)
  }, []))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text || images.uploading) return
    const ids = mentions
    const drafts = images.drafts
    const imageIds = images.ids
    setBody('')
    setMentions([])
    images.clear()
    const saved = await send({ id: '', author: meName, body: text, createdAt: new Date().toISOString(), edited: false, mine: true, reactions: [], images: images.previews }, async () => {
      const result = await post({ postId, body: text, mentionIds: ids, imageIds })
      return { ok: result.ok, id: result.ok ? (result.data?.id ?? null) : null }
    })
    if (saved) return
    setBody(text)
    setMentions(ids)
    images.restore(drafts)
  }
  return (
    <div>
      {rows.length ? (
        <ul className="-mx-2">
          {rows.map((r) => <ReplyItem key={r.id} reply={r} canModerate={canModerate} />)}
        </ul>
      ) : (
        <p className="py-4 text-[13px] text-fg-2">No replies yet. Start the conversation.</p>
      )}
      <form onSubmit={(e) => void submit(e)} className="mt-2 space-y-3 border-t border-line pt-4">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000} placeholder="Write a reply" aria-label="Reply" />
        <ImageDraftStrip drafts={images.drafts} onRemove={images.remove} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-[240px] flex-1 items-start gap-2">
            <ImagePickButton onFiles={images.add} count={images.drafts.length} />
            <div className="min-w-0 flex-1"><PeoplePicker people={people} value={mentions} onChange={setMentions} placeholder="Mention someone" /></div>
          </div>
          <Button type="submit" variant="primary" icon={<Reply className="size-4" />} disabled={!body.trim() || images.uploading}>Reply</Button>
        </div>
      </form>
    </div>
  )
}
