import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import type { SideEffect } from '@/lib/side-effects'
import { Task } from '@/models/work/Task'
import { logActivity } from './activity-log'
import { notifyComment } from './notify'

type CommentTask = Parameters<typeof notifyComment>[1] & { _id: Types.ObjectId; projectId?: Types.ObjectId | null }
type SavedComment = Readonly<{ _id: Types.ObjectId; body: string; mentionIds: Types.ObjectId[] }>

/**
 * What follows a saved task comment, run after the response
 * (lib/after-response): the author and the people mentioned start watching,
 * a comment_added activity row, and the mention / watcher notifications.
 */
export function commentEffects(ctx: Ctx, task: CommentTask, comment: SavedComment): SideEffect[] {
  return [
    { label: 'watchers', run: () => ctx.db(Task).updateOne({ _id: task._id }, { $addToSet: { watcherIds: { $each: [ctx.memberId, ...comment.mentionIds] } } }) },
    { label: 'activity', run: () => logActivity(ctx, [{ type: 'comment_added', taskId: task._id, projectId: task.projectId, meta: { commentId: String(comment._id) } }]) },
    { label: 'notifications', run: () => notifyComment(ctx, task, { _id: comment._id, body: comment.body, mentionIds: comment.mentionIds }) },
  ]
}
