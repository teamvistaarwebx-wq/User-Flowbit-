'use server'

import type { Types } from 'mongoose'
import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { afterResponse } from '@/lib/after-response'
import { ForbiddenError, NotFoundError, UserError } from '@/lib/errors'
import { objectId } from '@/lib/validation'
import { Member } from '@/models/Member'
import { TaskComment } from '@/models/work/TaskComment'
import { COMMENT_REACTIONS } from './constants'
import { requireTask } from './load'
import { MAX_INLINE_IMAGES } from '@/lib/inline-images'
import { claimImages } from '../images'
import { commentEffects } from './comment-effects'
import { revalidateTask } from './revalidate'
import { commentBody } from './schemas'
import { getViewer } from './viewer'

const READ = { product: 'work', perm: 'tasks.read' } as const

/**
 * Comment (or reply) on a task the member can see. Only the comment is saved
 * before the response; watchers, the activity row and the notifications
 * follow after it (comment-effects), and only the task page is refreshed.
 */
export const addComment = action(
  z.object({ taskId: objectId, body: commentBody, mentionIds: z.array(objectId).default([]), parentId: objectId.optional(), imageIds: z.array(objectId).max(MAX_INLINE_IMAGES).default([]) }),
  async ({ taskId, body, mentionIds, parentId, imageIds }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, taskId)
    const [parent, mentioned, images] = await Promise.all([
      parentId ? ctx.db(TaskComment).findOne({ _id: parentId, taskId: task._id }, { parentId: 1 }).lean() : null,
      mentionIds.length ? ctx.db(Member).find({ _id: { $in: mentionIds }, status: 'active' }, { _id: 1 }).lean() : [],
      claimImages(ctx, imageIds, { kind: 'comment_image', entityId: task._id }),
    ])
    if (parentId && !parent) throw new NotFoundError('That comment')
    const topLevel: Types.ObjectId | null = parent ? (parent.parentId ?? parent._id) : null
    const mentionedIds = mentioned.map((m) => m._id)
    const comment = await ctx.db(TaskComment).create({ taskId: task._id, authorId: ctx.memberId, body, parentId: topLevel, mentionIds: mentionedIds, images })
    afterResponse('task comment', commentEffects(ctx, task, { _id: comment._id, body, mentionIds: mentionedIds }))
    revalidateTask(String(task._id))
    return ok(undefined, { id: String(comment._id) })
  },
  READ,
)

/** Only the author edits a comment. */
export const editComment = action(
  z.object({ id: objectId, body: commentBody }),
  async ({ id, body }, ctx) => {
    const comment = await ctx.db(TaskComment).findById(id).lean()
    if (!comment) throw new NotFoundError('That comment')
    if (String(comment.authorId) !== String(ctx.memberId)) throw new ForbiddenError('You can only edit your own comments.')
    await requireTask(ctx, await getViewer(ctx), String(comment.taskId))
    await ctx.db(TaskComment).updateOne({ _id: comment._id }, { $set: { body, editedAt: new Date() } })
    revalidateTask(String(comment.taskId))
    return ok('Comment updated')
  },
  READ,
)

/** Author or tasks.manage; deleting a comment also deletes its replies. */
export const deleteComment = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const comment = await ctx.db(TaskComment).findById(id).lean()
    if (!comment) throw new NotFoundError('That comment')
    const mine = String(comment.authorId) === String(ctx.memberId)
    if (!mine && !ctx.can('tasks.manage')) throw new ForbiddenError('You can only delete your own comments.')
    await requireTask(ctx, await getViewer(ctx), String(comment.taskId))
    await ctx.db(TaskComment).deleteMany({ $or: [{ _id: comment._id }, { parentId: comment._id }] })
    revalidateTask(String(comment.taskId))
    return ok('Comment deleted')
  },
  READ,
)

/** Toggle my reaction with an emoji from the quick set. */
export const toggleReaction = action(
  z.object({ id: objectId, emoji: z.string() }),
  async ({ id, emoji }, ctx) => {
    if (!(COMMENT_REACTIONS as readonly string[]).includes(emoji)) throw new UserError('Pick a reaction from the list.')
    const comment = await ctx.db(TaskComment).findById(id).lean()
    if (!comment) throw new NotFoundError('That comment')
    await requireTask(ctx, await getViewer(ctx), String(comment.taskId))
    const mine = (comment.reactions ?? []).some((r) => r.emoji === emoji && String(r.memberId) === String(ctx.memberId))
    await ctx.db(TaskComment).updateOne(
      { _id: comment._id },
      mine ? { $pull: { reactions: { emoji, memberId: ctx.memberId } } } : { $push: { reactions: { emoji, memberId: ctx.memberId, at: new Date() } } },
    )
    revalidateTask(String(comment.taskId))
    return ok()
  },
  READ,
)
