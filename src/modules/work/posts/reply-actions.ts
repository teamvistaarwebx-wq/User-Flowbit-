'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { afterResponse } from '@/lib/after-response'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { notifyMembers } from '@/lib/notify'
import { listOf, objectId } from '@/lib/validation'
import { Post } from '@/models/work/Post'
import { PostReply } from '@/models/work/PostReply'
import { assertActiveMembers } from '../teams/people'
import { isModerator, loadPost } from './access'
import { REACTION_EMOJIS, toggleReaction } from './rules'
import { claimImages } from '../images'

const W = { product: 'work', perm: 'posts.write' } as const
const body = z.string({ error: "Reply can't be empty" }).trim().min(1, "Reply can't be empty").max(5000, 'Reply is too long')
const refresh = (postId: string) => {
  revalidatePath(`/app/work/posts/${postId}`)
  revalidatePath('/app/work/posts')
}

async function loadReply(ctx: Ctx, id: string) {
  const reply = await ctx.db(PostReply).findOne({ _id: id, deletedAt: null }).lean()
  if (!reply) throw new NotFoundError('That reply')
  await loadPost(ctx, String(reply.postId))
  return reply
}

/**
 * Saves the reply and answers at once; the post's counters and the author /
 * mention notifications follow after the response (lib/after-response).
 */
export const createReply = action(
  z.object({ postId: objectId, body, mentionIds: listOf(objectId), imageIds: listOf(objectId) }),
  async ({ postId, body: text, mentionIds, imageIds }, ctx) => {
    const [post, , images] = await Promise.all([loadPost(ctx, postId), assertActiveMembers(ctx, mentionIds), claimImages(ctx, imageIds, { kind: 'post_image' })])
    const reply = await ctx.db(PostReply).create({ postId: post._id, authorId: ctx.memberId, body: text, mentionIds, images })
    const href = `/app/work/posts/${postId}`
    const author = String(post.authorId)
    const mentioned = mentionIds.filter((id) => id !== author)
    afterResponse('post reply', [
      { label: 'reply count', run: () => ctx.db(Post).updateOne({ _id: post._id }, { $inc: { replyCount: 1 }, $set: { lastActivityAt: new Date() } }) },
      { label: 'author notification', run: () => notifyMembers(ctx, [author], { title: `${ctx.user.name} replied to '${post.title}'`, href, kind: 'info', product: 'work', event: 'post.reply' }) },
      { label: 'mention notifications', run: () => notifyMembers(ctx, mentioned, { title: `${ctx.user.name} mentioned you in '${post.title}'`, href, kind: 'mention', product: 'work', event: 'post.mention' }) },
    ])
    revalidatePath(href)
    return ok(undefined, { id: String(reply._id) })
  },
  W,
)

export const updateReply = action(
  z.object({ id: objectId, body }),
  async ({ id, body: text }, ctx) => {
    const reply = await loadReply(ctx, id)
    if (String(reply.authorId) !== String(ctx.memberId)) return fail('You can only edit your own replies.')
    await ctx.db(PostReply).updateOne({ _id: reply._id }, { $set: { body: text, editedAt: new Date() } })
    refresh(String(reply.postId))
    return ok('Reply updated')
  },
  W,
)

export const deleteReply = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const reply = await loadReply(ctx, id)
    if (String(reply.authorId) !== String(ctx.memberId) && !isModerator(ctx)) return fail('Only the author or a moderator can remove this reply.')
    await ctx.db(PostReply).updateOne({ _id: reply._id }, { $set: { deletedAt: new Date() } })
    await ctx.db(Post).updateOne({ _id: reply.postId, replyCount: { $gt: 0 } }, { $inc: { replyCount: -1 } })
    refresh(String(reply.postId))
    return ok('Reply removed')
  },
  W,
)

export const reactToReply = action(
  z.object({ id: objectId, emoji: z.enum(REACTION_EMOJIS) }),
  async ({ id, emoji }, ctx) => {
    const reply = await loadReply(ctx, id)
    const groups = toggleReaction(reply.reactions.map((g) => ({ emoji: g.emoji, memberIds: g.memberIds.map(String) })), emoji, String(ctx.memberId))
    await ctx.db(PostReply).updateOne({ _id: reply._id }, { $set: { reactions: groups } })
    refresh(String(reply.postId))
    return ok()
  },
  W,
)
