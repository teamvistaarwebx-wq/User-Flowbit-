import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { escapeRegex } from '@/lib/utils'
import { Post } from '@/models/work/Post'
import { PostReply } from '@/models/work/PostReply'
import { Team } from '@/models/work/Team'
import { listPeople, type Person } from '../teams/people'
import { audienceOf, isModerator, memberCanSee, postScope } from './access'
import { ackRows, type AckRow } from './acks'
import { viewerGroups, withGroups, type GroupedPerson } from './audience'
import { categoriesFor, postTypeOf, type PostType } from './post-types'
import { pollView, type PollView } from './polls'
import { audienceMembers, reactionSummary, type PostSort } from './rules'
import type { MongoFilter } from '../reports/mongo-filter'
import type { InlineImage } from '@/lib/inline-images'
import { imagesView } from '../images'

export const POSTS_PAGE_SIZE = 20
const PINNED_LIMIT = 5
const SCHEDULED_LIMIT = 10

export type PostCardData = {
  id: string
  title: string
  message: string
  type: PostType
  category: string
  priority: string
  audience: string
  targetRoles: string[]
  /** Group audience names (teams, departments, locations). */
  targetGroups: string[]
  targetTeamIds: string[]
  targetDepartments: string[]
  targetLocations: string[]
  author: { id: string; name: string; title?: string }
  mentionIds: string[]
  featured: { id: string; name: string }[]
  pinned: boolean
  createdAt: string
  editedAt?: string
  expiresOn?: string
  /** Set while the post waits for its publish time (author and moderators only see it). */
  scheduledFor?: string
  automatic: boolean
  replyCount: number
  repliers: string[]
  reactions: { emoji: string; count: number; mine: boolean }[]
  seen: number
  audienceSize: number
  isRead: boolean
  canEdit: boolean
  images: InlineImage[]
  poll?: PollView
  /** Policy posts: my acknowledgement and the count. */
  ack?: { mine: boolean; done: number; total: number }
  event?: { startsAt: string; place?: string }
}

type LeanPost = Awaited<ReturnType<typeof findPosts>>[number]
const findPosts = (ctx: Ctx, filter: MongoFilter, sort: Record<string, 1 | -1>, skip: number, limit: number) => ctx.db(Post).find(filter).sort(sort).skip(skip).limit(limit).lean()

type CardEnv = { people: GroupedPerson[]; teamNames: Map<string, string>; now: Date }

function ackOf(p: LeanPost, audience: GroupedPerson[], me: string): PostCardData['ack'] {
  if (postTypeOf(p.category) !== 'policy') return undefined
  const ids = new Set(audience.map((a) => a.id).filter((id) => id !== String(p.authorId)))
  return { mine: p.acks.some((a) => String(a.memberId) === me), done: p.acks.filter((a) => ids.has(String(a.memberId))).length, total: ids.size }
}

function toCard(ctx: Ctx, p: LeanPost, env: CardEnv, repliers: string[]): PostCardData {
  const me = String(ctx.memberId)
  const nameOf = (id: string) => env.people.find((x) => x.id === id)?.name ?? 'Former member'
  const author = env.people.find((x) => x.id === String(p.authorId))
  const audience = audienceMembers(audienceOf(p), env.people.filter((x) => x.active))
  const teams = (p.targetTeamIds ?? []).map(String)
  return {
    id: String(p._id),
    title: p.title,
    message: p.message,
    type: postTypeOf(p.category),
    category: p.category,
    priority: p.priority,
    audience: p.audience,
    targetRoles: p.targetRoles,
    targetGroups: [...teams.map((id) => env.teamNames.get(id) ?? 'Team'), ...(p.targetDepartments ?? []), ...(p.targetLocations ?? [])],
    targetTeamIds: teams,
    targetDepartments: p.targetDepartments ?? [],
    targetLocations: p.targetLocations ?? [],
    author: { id: String(p.authorId), name: author?.name ?? 'Former member', title: author?.title },
    mentionIds: p.mentionIds.map(String),
    featured: (p.featuredIds ?? []).map((id) => ({ id: String(id), name: nameOf(String(id)) })),
    pinned: p.pinned,
    createdAt: p.createdAt.toISOString(),
    editedAt: p.editedAt?.toISOString(),
    expiresOn: p.expiresAt ? p.expiresAt.toISOString().slice(0, 10) : undefined,
    scheduledFor: p.published === false && p.publishAt ? p.publishAt.toISOString() : undefined,
    automatic: Boolean(p.autoKey),
    replyCount: p.replyCount,
    repliers,
    reactions: reactionSummary(p.reactions.map((g) => ({ emoji: g.emoji, memberIds: g.memberIds.map(String) })), me),
    seen: p.reads.length,
    audienceSize: audience.length,
    isRead: p.reads.some((r) => String(r.memberId) === me),
    canEdit: String(p.authorId) === me || isModerator(ctx),
    images: imagesView(p.images),
    poll: p.poll ? pollView({ options: p.poll.options.map((o) => ({ key: o.key, label: o.label, voterIds: o.voterIds.map(String) })), multiple: Boolean(p.poll.multiple), anonymous: Boolean(p.poll.anonymous), closesAt: p.poll.closesAt, closedAt: p.poll.closedAt }, me, env.now, nameOf) : undefined,
    ack: ackOf(p, audience, me),
    event: p.event?.startsAt ? { startsAt: p.event.startsAt.toISOString(), place: p.event.place ?? undefined } : undefined,
  }
}

/** Last three distinct repliers per post (names). */
async function recentRepliers(ctx: Ctx, postIds: unknown[], people: Person[]): Promise<Map<string, string[]>> {
  if (!postIds.length) return new Map()
  const rows = await ctx.db(PostReply).aggregate<{ _id: unknown; authors: unknown[] }>([
    { $match: { postId: { $in: postIds }, deletedAt: null } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$postId', authors: { $push: '$authorId' } } },
  ])
  return new Map(rows.map((r) => [String(r._id), [...new Set(r.authors.map(String))].slice(0, 3).map((id) => people.find((p) => p.id === id)?.name ?? 'Former member')]))
}

/** Adds former members who authored or were featured in posts so names still show, with their teams and location. */
async function cardEnv(ctx: Ctx, people: Person[], rows: LeanPost[]): Promise<CardEnv> {
  const ids = rows.flatMap((r) => [String(r.authorId), ...(r.featuredIds ?? []).map(String)])
  const missing = [...new Set(ids)].filter((id) => !people.some((p) => p.id === id))
  const everyone = missing.length ? [...people, ...(await listPeople(ctx, missing))] : people
  const teamIds = [...new Set(rows.flatMap((r) => (r.targetTeamIds ?? []).map(String)))]
  const teams = teamIds.length ? await ctx.db(Team).find({ _id: { $in: teamIds } }, { name: 1 }).lean() : []
  return { people: await withGroups(ctx, everyone), teamNames: new Map(teams.map((t) => [String(t._id), t.name])), now: new Date() }
}

export type FeedOptions = { type?: PostType; mentioned: boolean; author?: string; q: string; sort: PostSort; page: number }

async function cards(ctx: Ctx, rows: LeanPost[], people: Person[]): Promise<PostCardData[]> {
  const env = await cardEnv(ctx, people, rows)
  const repliers = await recentRepliers(ctx, rows.map((r) => r._id), env.people)
  return rows.map((r) => toCard(ctx, r, env, repliers.get(String(r._id)) ?? []))
}

/** The feed: audience-filtered; pinned posts in their own section (first page), my scheduled posts on top, then the chosen sort. */
export async function listPosts(ctx: Ctx, opts: FeedOptions) {
  const groups = await viewerGroups(ctx)
  const and: MongoFilter[] = [{ deletedAt: null }, postScope(ctx, groups), { published: { $ne: false } }]
  if (opts.type) and.push({ category: { $in: categoriesFor(opts.type) } })
  if (opts.mentioned) and.push({ $or: [{ mentionIds: ctx.memberId }, { featuredIds: ctx.memberId }] })
  if (opts.author) and.push({ authorId: opts.author })
  if (opts.q) {
    const re = new RegExp(escapeRegex(opts.q), 'i')
    and.push({ $or: [{ title: re }, { message: re }] })
  }
  const filter = { $and: [...and, { pinned: { $ne: true } }] }
  const order: Record<string, 1 | -1> = opts.sort === 'oldest' ? { createdAt: 1 } : opts.sort === 'active' ? { lastActivityAt: -1 } : { createdAt: -1 }
  const firstPage = opts.page === 1
  const [rows, total, pinnedRows, scheduledRows, people] = await Promise.all([
    findPosts(ctx, filter, { ...order, _id: -1 }, (opts.page - 1) * POSTS_PAGE_SIZE, POSTS_PAGE_SIZE),
    ctx.db(Post).countDocuments(filter),
    firstPage ? findPosts(ctx, { $and: [...and, { pinned: true }] }, { pinnedAt: -1, _id: -1 }, 0, PINNED_LIMIT) : Promise.resolve([] as LeanPost[]),
    firstPage && !opts.q ? findPosts(ctx, { deletedAt: null, published: false, authorId: ctx.memberId }, { publishAt: 1 }, 0, SCHEDULED_LIMIT) : Promise.resolve([] as LeanPost[]),
    listPeople(ctx),
  ])
  const all = await cards(ctx, [...pinnedRows, ...scheduledRows, ...rows], people)
  const byId = new Map(all.map((c) => [c.id, c]))
  const pick = (list: LeanPost[]) => list.map((r) => byId.get(String(r._id))!)
  return { pinned: pick(pinnedRows), scheduled: pick(scheduledRows), posts: pick(rows), total, people }
}

/** The acknowledgement list of a policy post (author and moderators). */
export async function ackList(ctx: Ctx, post: LeanPost): Promise<AckRow[]> {
  const people = await withGroups(ctx, await listPeople(ctx))
  const audience = audienceMembers(audienceOf(post), people)
  return ackRows(audience.map((p) => ({ id: p.id, name: p.name, email: p.email })), post.acks.map((a) => ({ memberId: String(a.memberId), at: a.at })), String(post.authorId))
}

export async function postDetail(ctx: Ctx, id: string) {
  const post = await ctx.db(Post).findOne({ _id: id }).lean()
  if (!post) return null
  if (post.deletedAt) return { removed: true as const }
  if (!(await memberCanSee(ctx, post))) return null
  const people = await listPeople(ctx)
  const replies = await ctx.db(PostReply).find({ postId: post._id, deletedAt: null }).sort({ createdAt: 1 }).lean()
  const env = await cardEnv(ctx, people, [post])
  const authors = replies.map((r) => String(r.authorId)).filter((rid) => !env.people.some((p) => p.id === rid))
  const everyone = authors.length ? [...env.people, ...(await listPeople(ctx, authors))] : env.people
  const me = String(ctx.memberId)
  const card = toCard(ctx, post, env, [])
  const audience = audienceMembers(audienceOf(post), env.people.filter((p) => p.active))
  const readBy = new Map(post.reads.map((r) => [String(r.memberId), r.readAt.toISOString()]))
  return {
    removed: false as const,
    card,
    receipts: audience.map((m) => ({ id: m.id, name: m.name, readAt: readBy.get(m.id) })).sort((a, b) => Number(Boolean(b.readAt)) - Number(Boolean(a.readAt))),
    acks: card.ack && card.canEdit ? await ackList(ctx, post) : undefined,
    replies: replies.map((r) => ({
      id: String(r._id),
      author: everyone.find((p) => p.id === String(r.authorId))?.name ?? 'Former member',
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      edited: Boolean(r.editedAt),
      mine: String(r.authorId) === me,
      reactions: reactionSummary(r.reactions.map((g) => ({ emoji: g.emoji, memberIds: g.memberIds.map(String) })), me),
      images: imagesView(r.images),
    })),
    people,
  }
}

/** Kudos a member received (Muster profile), newest first. */
export async function kudosFor(ctx: Ctx, memberId: string, limit = 20): Promise<PostCardData[]> {
  const groups = await viewerGroups(ctx)
  const rows = await findPosts(ctx, { $and: [{ deletedAt: null, category: 'kudos', featuredIds: memberId }, postScope(ctx, groups), { published: { $ne: false } }] }, { createdAt: -1 }, 0, limit)
  return cards(ctx, rows, await listPeople(ctx))
}

export type PopupAnnouncement = { id: string; title: string; message: string; priority: string; author: string; createdAt: string }
const POPUP_LIMIT = 5

/**
 * Unread announcements for the app-load popup (docs/archive/porting/work.md B4): live,
 * not expired ('Show until'), aimed at me, not mine and not read by me; newest first.
 */
export async function unreadAnnouncements(ctx: Ctx): Promise<PopupAnnouncement[]> {
  if (!ctx.has('work')) return []
  const me = ctx.memberId
  const groups = await viewerGroups(ctx)
  const posts = await ctx.db(Post)
    .find({
      category: 'announcement',
      deletedAt: null,
      published: { $ne: false },
      authorId: { $ne: me },
      'reads.memberId': { $ne: me },
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }, postScope(ctx, groups, { audienceOnly: true })],
    }, { title: 1, message: 1, priority: 1, authorId: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(POPUP_LIMIT)
    .lean()
  if (!posts.length) return []
  const people = new Map((await listPeople(ctx, posts.map((p) => p.authorId))).map((p) => [p.id, p.name]))
  return posts.map((p) => ({
    id: String(p._id),
    title: p.title,
    message: p.message,
    priority: p.priority ?? 'medium',
    author: people.get(String(p.authorId)) ?? 'Someone',
    createdAt: new Date(p.createdAt).toISOString(),
  }))
}
