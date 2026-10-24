'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDateTime } from '@/lib/dates'
import { notifyMembers } from '@/lib/notify'
import { objectId } from '@/lib/validation'
import { Post } from '@/models/work/Post'
import { listPeople } from '../teams/people'
import { audienceOf, isModerator, loadPost } from './access'
import { reminderClaimFilter, wonReminderClaim } from './ack-remind'
import { nextReminderAt, pendingAckIds } from './acks'
import { withGroups } from './audience'
import { castVote, type Poll } from './polls'
import { postTypeOf } from './post-types'
import { audienceMembers } from './rules'

/** Policy acknowledgements and poll votes: what members do on a live post. */

const refresh = (id: string) => {
  revalidatePath('/app/work/posts')
  revalidatePath(`/app/work/posts/${id}`)
}

const plainPoll = (poll: { options: { key: string; label: string; voterIds: unknown[] }[]; multiple?: boolean | null; anonymous?: boolean | null; closesAt?: Date | null; closedAt?: Date | null }): Poll => ({
  options: poll.options.map((o) => ({ key: o.key, label: o.label, voterIds: o.voterIds.map(String) })),
  multiple: Boolean(poll.multiple),
  anonymous: Boolean(poll.anonymous),
  closesAt: poll.closesAt ?? null,
  closedAt: poll.closedAt ?? null,
})

/** "I've read this" on a Policy post (once; the time is kept). */
export const acknowledgePost = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const post = await loadPost(ctx, id)
    if (postTypeOf(post.category) !== 'policy') return fail('Only policy posts ask for an acknowledgement.')
    if (post.published === false) return fail('This policy is not published yet.')
    await ctx.db(Post).updateOne({ _id: post._id, 'acks.memberId': { $ne: ctx.memberId } }, { $push: { acks: { memberId: ctx.memberId, at: new Date() } } })
    refresh(id)
    return ok('Thanks, noted that you have read it')
  },
  { product: 'work', allowReadOnly: true },
)

/** The author (or a moderator) reminds only the people who have not acknowledged yet; at most once an hour. */
export const remindPendingAcks = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const post = await loadPost(ctx, id)
    if (String(post.authorId) !== String(ctx.memberId) && !isModerator(ctx)) return fail('Only the author or a moderator can send reminders.')
    if (postTypeOf(post.category) !== 'policy') return fail('Only policy posts ask for an acknowledgement.')
    const wait = nextReminderAt(post.ackRemindedAt, new Date())
    if (wait) return fail(`A reminder went out recently. You can send the next one after ${formatDateTime(wait)}.`)
    const people = await withGroups(ctx, await listPeople(ctx))
    const audience = audienceMembers(audienceOf(post), people).map((p) => p.id)
    const pending = pendingAckIds(audience, post.acks.map((a) => ({ memberId: String(a.memberId), at: a.at })), String(post.authorId))
    if (!pending.length) return ok('Everyone has acknowledged it. Nobody to remind.')
    const claim = await ctx.db(Post).updateOne(reminderClaimFilter(post._id, post.ackRemindedAt), { $set: { ackRemindedAt: new Date() } })
    if (!wonReminderClaim(claim)) return fail('A reminder just went out. Try again in an hour.')
    await notifyMembers(ctx, pending, { title: `Reminder: please read and acknowledge '${post.title}'`, href: `/app/work/posts/${post._id}`, kind: 'reminder', product: 'work', event: 'post.policy', includeSelf: false })
    await audit(ctx, { action: 'post.ack_reminded', entity: 'Post', entityId: post._id, summary: `Reminded ${pending.length} people to acknowledge '${post.title}'`, product: 'work' })
    refresh(id)
    return ok(`Reminded ${pending.length} ${pending.length === 1 ? 'person' : 'people'}`)
  },
  { product: 'work', perm: 'posts.write' },
)

/** Votes (or changes or withdraws a vote) in a poll. */
export const votePoll = action(
  z.object({ id: objectId, keys: z.array(z.string().max(4)).max(8) }),
  async ({ id, keys }, ctx) => {
    const post = await loadPost(ctx, id)
    if (!post.poll || postTypeOf(post.category) !== 'poll') return fail('This post has no poll.')
    const result = castVote(plainPoll(post.poll), String(ctx.memberId), keys, new Date())
    if (!result.ok) return fail(result.error)
    // Guarded by updatedAt so two quick votes from different people cannot overwrite each other.
    const saved = await ctx.db(Post).updateOne({ _id: post._id, updatedAt: post.updatedAt }, { $set: { 'poll.options': result.poll.options } })
    if (!saved.modifiedCount) return fail('Someone voted at the same moment. Try again.')
    refresh(id)
    return ok(keys.length ? 'Vote saved' : 'Vote withdrawn')
  },
  { product: 'work', perm: 'posts.write' },
)

/** The author or a moderator closes a poll now. */
export const closePoll = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const post = await loadPost(ctx, id)
    if (String(post.authorId) !== String(ctx.memberId) && !isModerator(ctx)) return fail('Only the author or a moderator can close this poll.')
    if (!post.poll) return fail('This post has no poll.')
    await ctx.db(Post).updateOne({ _id: post._id }, { $set: { 'poll.closedAt': new Date() } })
    refresh(id)
    return ok('Poll closed')
  },
  { product: 'work', perm: 'posts.write' },
)
