'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { ForbiddenError } from '@/lib/errors'
import { notifyMembers } from '@/lib/notify'
import { cappedListOf, checkbox, isoDate, listOf, objectId, optionalText, requiredText } from '@/lib/validation'
import { Notification } from '@/models/Notification'
import { POST_AUDIENCES, POST_PRIORITIES, POST_TYPES, Post } from '@/models/work/Post'
import { assertActiveMembers } from '../teams/people'
import { isModerator, loadPost } from './access'
import { composePost, type ComposeResult } from './compose'
import { POST_TYPE_META, postTypeOf } from './post-types'
import { notifyPublished } from './publish'
import { REACTION_EMOJIS, toggleReaction } from './rules'
import { claimImages } from '../images'

const W = { product: 'work', perm: 'posts.write' } as const
const localDateTime = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use a date and time').optional().or(z.literal('').transform(() => undefined))

/** Caps on the audience and people lists (R3 L-23g). */
const MAX_TARGETS = 100
const MAX_PEOPLE = 200

const postSchema = z.object({
  title: requiredText('Title', 200),
  message: requiredText('Message', 5000),
  category: z.enum(POST_TYPES).default('update'),
  priority: z.enum(POST_PRIORITIES).default('medium'),
  audience: z.enum(POST_AUDIENCES).default('org'),
  targetRoles: cappedListOf(z.string().max(64), MAX_TARGETS),
  targetTeamIds: cappedListOf(objectId, MAX_TARGETS),
  targetDepartments: cappedListOf(z.string().max(100), MAX_TARGETS),
  targetLocations: cappedListOf(z.string().max(100), MAX_TARGETS),
  mentionIds: cappedListOf(objectId, MAX_PEOPLE),
  /** Kudos recipients, the person welcomed or celebrated. */
  featuredIds: cappedListOf(objectId, MAX_PEOPLE),
  expiresOn: isoDate.optional(),
  /** Images uploaded with uploadPostImage (new posts only; an edit keeps the post's images). */
  imageIds: listOf(objectId),
  pollOptions: listOf(z.string().max(120)),
  pollMultiple: checkbox,
  pollAnonymous: checkbox,
  pollClosesOn: isoDate.optional().or(z.literal('').transform(() => undefined)),
  eventAt: localDateTime,
  eventPlace: optionalText(200),
  /** Local IST time to publish at; blank publishes now. */
  publishAt: localDateTime,
})

type PostInput = z.output<typeof postSchema>

const refresh = (id?: string) => {
  revalidatePath('/app/work/posts')
  if (id) revalidatePath(`/app/work/posts/${id}`)
}

const expiryOf = (input: PostInput) => (input.category === 'announcement' && input.expiresOn ? new Date(`${input.expiresOn}T23:59:59+05:30`) : undefined)

function refusal(result: Extract<ComposeResult, { ok: false }>) {
  if (result.forbidden) throw new ForbiddenError(result.forbidden)
  return fail('Some fields need attention.', result.errors)
}

export const createPost = action(
  postSchema,
  async (input, ctx) => {
    const now = new Date()
    const composed = composePost(input, isModerator(ctx), now)
    if (!composed.ok) return refusal(composed)
    const c = composed.value
    const [, , images] = await Promise.all([
      assertActiveMembers(ctx, input.mentionIds),
      assertActiveMembers(ctx, c.featuredIds, 'Pick people who are in this workspace'),
      claimImages(ctx, input.imageIds, { kind: 'post_image' }),
    ])
    const at = c.publishAt ?? now
    const post = await ctx.db(Post).create({
      authorId: ctx.memberId,
      title: input.title,
      message: input.message,
      category: input.category,
      priority: input.category === 'announcement' ? input.priority : 'medium',
      ...c.audience,
      mentionIds: input.mentionIds,
      featuredIds: c.featuredIds,
      images,
      poll: c.poll,
      event: c.event,
      published: c.published,
      publishAt: c.publishAt,
      expiresAt: expiryOf(input),
      reads: [{ memberId: ctx.memberId, readAt: now }],
      createdAt: at,
      lastActivityAt: at,
    })
    const href = `/app/work/posts/${post._id}`
    const label = POST_TYPE_META[input.category].label
    refresh()
    if (!c.published) return ok(`${label} '${post.title}' scheduled`, { id: String(post._id) }, href)
    await notifyPublished(ctx, post, ctx.user.name)
    return ok(`${label} '${post.title}' published`, { id: String(post._id) }, href)
  },
  W,
)

export const updatePost = action(
  postSchema.extend({ id: objectId }),
  async (input, ctx) => {
    const post = await loadPost(ctx, input.id)
    if (String(post.authorId) !== String(ctx.memberId) && !isModerator(ctx)) return fail('Only the author or a moderator can edit this post.')
    // The type, poll and images stay as posted; a scheduled post may move its time.
    const category = postTypeOf(post.category)
    const kept = { category, pollOptions: (post.poll?.options ?? []).map((o) => o.label), pollClosesOn: undefined, publishAt: post.published === false ? input.publishAt : undefined }
    // Editing your own policy or announcement stays allowed after a role change; a new one is checked on create.
    const composed = composePost({ ...input, ...kept }, isModerator(ctx) || String(post.authorId) === String(ctx.memberId), new Date())
    if (!composed.ok) return refusal(composed)
    const c = composed.value
    await Promise.all([assertActiveMembers(ctx, input.mentionIds), assertActiveMembers(ctx, input.featuredIds, 'Pick people who are in this workspace')])
    const expiresAt = expiryOf({ ...input, category })
    const schedule = post.published === false ? { published: c.published, ...(c.publishAt ? { publishAt: c.publishAt, createdAt: c.publishAt, lastActivityAt: c.publishAt } : {}) } : {}
    await ctx.db(Post).updateOne(
      { _id: post._id },
      {
        $set: {
          title: input.title,
          message: input.message,
          category,
          priority: category === 'announcement' ? input.priority : 'medium',
          ...c.audience,
          mentionIds: input.mentionIds,
          featuredIds: c.featuredIds,
          ...(c.event ? { event: c.event } : {}),
          ...schedule,
          editedAt: new Date(),
          ...(expiresAt ? { expiresAt } : {}),
        },
        ...(expiresAt ? {} : { $unset: { expiresAt: 1 } }),
      },
    )
    if (post.published === false && c.published) await notifyPublished(ctx, { ...post, title: input.title, ...(c.audience), mentionIds: input.mentionIds, featuredIds: c.featuredIds }, ctx.user.name)
    else if (post.published !== false) {
      const added = input.mentionIds.filter((id) => !post.mentionIds.some((m) => String(m) === id))
      await notifyMembers(ctx, added, { title: `${ctx.user.name} mentioned you in '${input.title}'`, href: `/app/work/posts/${post._id}`, kind: 'mention', product: 'work', event: 'post.mention' })
    }
    refresh(input.id)
    return ok('Post updated')
  },
  W,
)

export const deletePost = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const post = await loadPost(ctx, id)
    if (String(post.authorId) !== String(ctx.memberId) && !isModerator(ctx)) return fail('Only the author or a moderator can remove this post.')
    await ctx.db(Post).updateOne({ _id: post._id }, { $set: { deletedAt: new Date(), pinned: false } })
    await audit(ctx, { action: 'post.deleted', entity: 'Post', entityId: post._id, summary: `Removed post '${post.title}'`, product: 'work' })
    refresh(id)
    return ok('Post removed', undefined, '/app/work/posts')
  },
  W,
)

export const togglePin = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const post = await loadPost(ctx, id)
    const pinned = !post.pinned
    await ctx.db(Post).updateOne({ _id: post._id }, pinned ? { $set: { pinned, pinnedAt: new Date(), pinnedById: ctx.memberId } } : { $set: { pinned }, $unset: { pinnedAt: 1, pinnedById: 1 } })
    refresh(id)
    return ok(pinned ? `Pinned '${post.title}'` : `Unpinned '${post.title}'`)
  },
  { product: 'work', perm: 'posts.manage' },
)

export const reactToPost = action(
  z.object({ id: objectId, emoji: z.enum(REACTION_EMOJIS) }),
  async ({ id, emoji }, ctx) => {
    const post = await loadPost(ctx, id)
    const groups = toggleReaction(post.reactions.map((g) => ({ emoji: g.emoji, memberIds: g.memberIds.map(String) })), emoji, String(ctx.memberId))
    await ctx.db(Post).updateOne({ _id: post._id }, { $set: { reactions: groups } })
    refresh(id)
    return ok()
  },
  W,
)

/** Opening a post records the read receipt and clears its notifications for me. */
export const markPostRead = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const post = await loadPost(ctx, id)
    if (!post.reads.some((r) => String(r.memberId) === String(ctx.memberId))) {
      await ctx.db(Post).updateOne({ _id: post._id, 'reads.memberId': { $ne: ctx.memberId } }, { $push: { reads: { memberId: ctx.memberId, readAt: new Date() } } })
    }
    await ctx.db(Notification).updateMany({ userId: ctx.userId, href: `/app/work/posts/${id}`, readAt: null }, { $set: { readAt: new Date() } })
    return ok()
  },
  { product: 'work', allowReadOnly: true },
)
