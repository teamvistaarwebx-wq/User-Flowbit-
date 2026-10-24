'use client'

import { useCallback, useState } from 'react'
import type { InlineImage } from '@/lib/inline-images'
import { uploadCommentImage } from '@/modules/work/tasks/comment-image-actions'
import { ImageDraftStrip, ImagePickButton } from '../../media/image-draft'
import { useImageUploads } from '../../media/use-image-uploads'
import { addComment } from '@/modules/work/tasks/comment-actions'
import { activityActor, describeActivity } from '@/modules/work/tasks/activity'
import { TimeAgo } from '@/components/ui/time-ago'
import { useAction } from '@/components/ui/action-form'
import { useOptimisticList } from '@/components/ui/use-optimistic-list'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ChipGroup } from '@/components/ui/chip-group'
import { MentionTextarea } from '../mention-textarea'
import { useTaskData } from '../task-data'
import { CommentItem, type CommentRow } from './comment-item'

export type ActivityItem = { id: string; actorId: string; type: string; from?: unknown; to?: unknown; meta?: Record<string, unknown> | null; createdAt: string }

type Filter = 'all' | 'comments' | 'activity'

type CommentInput = { body: string; mentionIds: string[]; parentId?: string; imageIds: string[]; previews: InlineImage[] }

/** Clears at once and hands the comment to `onSend`; on failure the text comes back. */
function Composer({ taskId, parentId, priorityIds, onSend, onDone, autoFocus, placeholder }: { taskId: string; parentId?: string; priorityIds: string[]; onSend: (input: CommentInput) => Promise<boolean>; onDone?: () => void; autoFocus?: boolean; placeholder: string }) {
  const data = useTaskData()
  const [body, setBody] = useState('')
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const images = useImageUploads(useCallback((file: File) => {
    const form = new FormData()
    form.set('taskId', taskId)
    form.set('file', file)
    return uploadCommentImage(form)
  }, [taskId]))
  const submit = async () => {
    const text = body.trim()
    if (!text || images.uploading) return
    const ids = mentionIds
    const drafts = images.drafts
    setBody('')
    setMentionIds([])
    images.clear()
    const saved = await onSend({ body: text, mentionIds: ids, parentId, imageIds: images.ids, previews: images.previews })
    if (!saved) {
      setBody(text)
      setMentionIds(ids)
      images.restore(drafts)
      return
    }
    onDone?.()
  }
  return (
    <div className="space-y-2">
      <MentionTextarea
        value={body}
        onChange={(text, ids) => {
          setBody(text)
          setMentionIds(ids)
        }}
        people={data.people}
        priorityIds={priorityIds}
        placeholder={placeholder}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        onSubmit={submit}
      />
      <ImageDraftStrip drafts={images.drafts} onRemove={images.remove} />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-fg-3">
          <ImagePickButton onFiles={images.add} count={images.drafts.length} />
          <span className="hidden sm:inline">Type @ to mention · ⌘/Ctrl + Enter to post</span>
        </span>
        <Button size="sm" variant="primary" disabled={!body.trim() || images.uploading} onClick={() => void submit()}>
          {parentId ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </div>
  )
}

/** Comments (with replies, reactions and @mentions) interleaved with the activity timeline. */
export function ActivityPanel({ taskId, comments, activity, priorityIds }: { taskId: string; comments: CommentRow[]; activity: ActivityItem[]; priorityIds: string[] }) {
  const data = useTaskData()
  const [filter, setFilter] = useState<Filter>('all')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [post] = useAction(addComment)
  // A new comment shows at once as "Sending…" and is rolled back if the save fails (lib/optimistic-list).
  const { rows, send } = useOptimisticList(comments)
  const onSend = (input: CommentInput) =>
    send({ id: '', authorId: data.me, body: input.body, parentId: input.parentId ?? null, mentionIds: input.mentionIds, reactions: [], editedAt: null, createdAt: new Date().toISOString(), images: input.previews }, async () => {
      const result = await post({ taskId, body: input.body, mentionIds: input.mentionIds, parentId: input.parentId, imageIds: input.imageIds })
      return { ok: result.ok, id: result.ok ? (result.data?.id ?? null) : null }
    })
  const topLevel = rows.filter((c) => !c.parentId)
  const repliesOf = (id: string) => rows.filter((c) => c.parentId === id)
  const feed = [
    ...(filter !== 'activity' ? topLevel.map((c) => ({ kind: 'comment' as const, at: c.createdAt, comment: c })) : []),
    ...(filter !== 'comments' ? activity.filter((a) => a.type !== 'comment_added').map((a) => ({ kind: 'activity' as const, at: a.createdAt, row: a })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="space-y-4">
      <Composer taskId={taskId} priorityIds={priorityIds} onSend={onSend} placeholder="Write a comment…" />
      <ChipGroup size="sm" value={filter} onValueChange={(v) => setFilter(v as Filter)} options={[{ value: 'all', label: 'All' }, { value: 'comments', label: 'Comments', count: rows.length }, { value: 'activity', label: 'Activity' }]} />
      {feed.length === 0 ? <p className="py-6 text-center text-[13px] text-fg-2">{filter === 'activity' ? 'No activity yet.' : 'No comments yet. Start the conversation.'}</p> : null}
      <ol className="-mx-2 space-y-1">
        {feed.map((item) =>
          item.kind === 'comment' ? (
            <li key={`c-${item.comment.id}`} className="rounded-[10px] px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
              <CommentItem comment={item.comment} onReply={() => setReplyTo(replyTo === item.comment.id ? null : item.comment.id)} />
              {repliesOf(item.comment.id).length || replyTo === item.comment.id ? (
                <div className="ml-11 mt-3 space-y-3 border-l border-white/[0.12] pl-3">
                  {repliesOf(item.comment.id).map((r) => <CommentItem key={r.id} comment={r} compact onReply={() => setReplyTo(item.comment.id)} />)}
                  {replyTo === item.comment.id ? <Composer taskId={taskId} parentId={item.comment.id} priorityIds={[item.comment.authorId, ...priorityIds]} onSend={onSend} autoFocus onDone={() => setReplyTo(null)} placeholder="Write a reply…" /> : null}
                </div>
              ) : null}
            </li>
          ) : (
            <li key={`a-${item.row.id}`} className="flex items-start gap-2.5 px-2 py-1 text-[13px]">
              <Avatar name={activityActor(item.row, data.nameOf)} size="xs" />
              <p className="min-w-0 flex-1 leading-5 text-fg-2">
                <span className="font-medium text-white">{activityActor(item.row, data.nameOf)}</span> {describeActivity(item.row, data.nameOf)}
                <span className="ml-1.5 whitespace-nowrap text-[#979797]">· <TimeAgo value={item.row.createdAt} /></span>
              </p>
            </li>
          ),
        )}
      </ol>
    </div>
  )
}
