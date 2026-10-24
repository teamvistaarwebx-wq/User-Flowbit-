'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { useAction } from '@/components/ui/action-form'
import { formatDateTime } from '@/lib/dates'
import { toast } from '@/lib/toast'
import { deletePost, markPostRead, togglePin } from '@/modules/work/posts/actions'
import type { GroupOptions } from '@/modules/work/posts/audience'
import type { PickPerson } from '../teams/people-picker'
import { PostComposer, type ComposerPost } from './post-composer'

/** Pin, edit and delete controls for a post (shown per permission). */
export function PostTools({ post, canPin, canEdit, people, groups, canAnnounce }: { post: ComposerPost & { pinned: boolean }; canPin: boolean; canEdit: boolean; people: PickPerson[]; groups: GroupOptions; canAnnounce: boolean }) {
  const [pin, pinning] = useAction(togglePin)
  const [editing, setEditing] = useState(false)
  return (
    <div className="relative z-10 flex items-center">
      {canPin ? (
        <IconButton label={post.pinned ? 'Unpin' : 'Pin to top'} size="sm" loading={pinning} onClick={() => pin({ id: post.id })}>
          {post.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </IconButton>
      ) : null}
      {canEdit ? (
        <>
          <Dialog open={editing} onOpenChange={setEditing} size="lg" title="Edit post" trigger={<IconButton label="Edit post" size="sm"><Pencil className="size-4" /></IconButton>}>
            <PostComposer people={people} groups={groups} canAnnounce={canAnnounce} post={post} onDone={() => setEditing(false)} />
          </Dialog>
          <ConfirmDialog
            trigger={<IconButton label="Remove post" size="sm"><Trash2 className="size-4" /></IconButton>}
            title={`Remove '${post.title}'?`}
            description="It disappears from the feed for everyone."
            confirmLabel="Remove"
            onConfirm={() => deletePost({ id: post.id })}
          />
        </>
      ) : null}
    </div>
  )
}

/** "Seen by 12 of 20" with the list (author and moderators). */
export function ReadReceipts({ seen, total, receipts }: { seen: number; total: number; receipts?: { id: string; name: string; readAt?: string }[] }) {
  const label = `Seen by ${Math.min(seen, total)} of ${total}`
  if (!receipts) return <span className="inline-flex items-center gap-1 text-[13px] text-[#979797]"><Eye className="size-3.5" /> {label}</span>
  return (
    <Dialog title="Read receipts" description={label} trigger={<button type="button" className="relative z-10 inline-flex items-center gap-1 text-[13px] text-[#979797] transition-colors hover:text-white"><Eye className="size-3.5" /> {label}</button>}>
      <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
        {receipts.map((r) => (
          <li key={r.id} className="flex items-center gap-2.5 text-sm">
            <Avatar name={r.name} size="xs" />
            <span className="flex-1 text-white">{r.name}</span>
            <span className={r.readAt ? 'text-xs text-[#2DCBAF]' : 'text-xs text-fg-3'}>{r.readAt ? `Seen ${formatDateTime(r.readAt)}` : 'Not seen yet'}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

/** Records the read receipt once when the post is opened. */
export function MarkRead({ postId, already }: { postId: string; already: boolean }) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    void markPostRead({ id: postId }).then((r) => {
      if (!r.ok && !already) toast.error(r.error)
    })
  }, [postId, already])
  return null
}
