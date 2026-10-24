import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { notifyMembers } from '@/lib/notify'
import { resolvePermissions } from '@/lib/permissions'
import type { SystemDb } from '@/lib/platform'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { Post } from '@/models/work/Post'
import { listPeople } from '../teams/people'
import { audienceOf } from './access'
import { withGroups } from './audience'
import { postTypeOf } from './post-types'
import { scheduledPublishRefusal } from './publish-rules'
import { kudosManagers, postRecipients } from './rules'
import { duePostsFilter } from './schedule'

/**
 * What happens when a post goes live (at once, or when the posts cron
 * publishes a scheduled one): announcements and policies reach their
 * audience, kudos and welcome posts reach the people they are about, kudos
 * also reach those people's managers, and mentions reach the mentioned.
 */

type Scope = Pick<Ctx, 'orgId' | 'db'> & { userId?: Types.ObjectId | null }
type LivePost = Parameters<typeof audienceOf>[0] & { _id: unknown; title: string; category: string }

const DUE_BATCH = 200

const AUDIENCE_TITLE: Record<string, (title: string) => string> = {
  announcement: (t) => `New announcement: ${t}`,
  policy: (t) => `Please read and acknowledge: ${t}`,
}

export async function notifyPublished(scope: Scope, post: LivePost, authorName: string): Promise<void> {
  const type = postTypeOf(post.category)
  const people = await withGroups(scope, await listPeople(scope))
  const { audience, mentioned, featured } = postRecipients({ ...audienceOf(post), category: type }, people)
  const href = `/app/work/posts/${post._id}`
  const ctx = { orgId: scope.orgId, userId: scope.userId ?? null }
  if (audience.length) await notifyMembers(ctx, audience, { title: (AUDIENCE_TITLE[type] ?? AUDIENCE_TITLE.announcement)(post.title), href, kind: 'info', product: 'work', event: `post.${type}` })
  if (featured.length) {
    const title = type === 'kudos' ? `${authorName} gave you kudos: '${post.title}'` : `${authorName} posted about you: '${post.title}'`
    await notifyMembers(ctx, featured, { title, href, kind: 'success', product: 'work', event: `post.${type}` })
  }
  if (type === 'kudos') {
    const byId = new Map(people.map((p) => [p.id, p]))
    const featuredPeople = featured.map((id) => ({ id, managerId: byId.get(id)?.managerId }))
    const names = featured.map((id) => byId.get(id)?.name).filter(Boolean).join(', ')
    const managers = kudosManagers(featuredPeople, String(post.authorId)).filter((id) => !audience.includes(id))
    if (managers.length) await notifyMembers(ctx, managers, { title: `${names} got kudos from ${authorName}`, body: post.title, href, kind: 'success', product: 'work', event: 'post.kudos_manager' })
  }
  if (mentioned.length) await notifyMembers(ctx, mentioned, { title: `${authorName} mentioned you in '${post.title}'`, href, kind: 'mention', product: 'work', event: 'post.mention' })
}

type DueRow = { _id: Types.ObjectId; orgId: Types.ObjectId; authorId: Types.ObjectId; category?: string | null }

/** Re-checks the workspace and the author at publish time (R3 L-21b): a refusal, or null to publish. */
async function refusalAtPublish(db: SystemDb, row: DueRow, now: Date): Promise<string | null> {
  const scope = db.forOrg(row.orgId)
  const [org, author] = await Promise.all([
    db.raw(Org).findById(row.orgId).lean(),
    scope.db(Member).findById(row.authorId, { status: 1, role: 1 }).lean(),
  ])
  const customRoles = author ? await scope.db(Role).find({ builtIn: false }, { key: 1, label: 1, permissions: 1 }).lean() : []
  const canModerate = author ? resolvePermissions(author.role, customRoles).has('posts.manage') : false
  return scheduledPublishRefusal(org, author ? { status: author.status, canModerate } : null, row.category ?? 'update', now)
}

/** /api/cron/posts: publishes scheduled posts whose time has come, each once (claimed by the update). Their createdAt is the scheduled time, so they sort as if posted then. */
export async function publishDuePosts(db: SystemDb, now: Date = new Date()): Promise<{ published: number; failed: number; refused: number }> {
  const due = await db.raw(Post).find(duePostsFilter(now), { _id: 1, orgId: 1, authorId: 1, category: 1 }).sort({ publishAt: 1 }).limit(DUE_BATCH).lean()
  let published = 0
  let failed = 0
  let refused = 0
  for (const row of due) {
    try {
      const refusal = await refusalAtPublish(db, row, now)
      if (refusal) {
        // Off the due list for good, so a stuck post never holds up the batch; the author still sees it unpublished.
        await db.raw(Post).updateOne({ _id: row._id, published: false }, { $unset: { publishAt: 1 }, $set: { publishRefusedReason: refusal } })
        refused += 1
        continue
      }
      const post = await db.raw(Post).findOneAndUpdate({ _id: row._id, published: false }, { $set: { published: true } }, { returnDocument: 'after' }).lean()
      if (!post) continue
      const scope = db.forOrg(row.orgId)
      const [author] = await listPeople(scope, [post.authorId])
      await notifyPublished({ orgId: row.orgId, db: scope.db }, post, author?.name ?? 'Someone')
      published += 1
    } catch (error) {
      failed += 1
      console.error('[cron posts] could not publish', String(row._id), error)
    }
  }
  return { published, failed, refused }
}
