/**
 * The 'post' automation step (pure): the feed post a People recipe writes
 * (birthday and work-anniversary Celebrations, a Welcome for a new joiner)
 * and the key that keeps it to one post per person and occurrence, however
 * often the scan runs.
 */

export const FEED_POST_TYPES = ['celebration', 'welcome'] as const
export type FeedPostType = (typeof FEED_POST_TYPES)[number]

const TITLE_MAX = 200
const MESSAGE_MAX = 5000

/**
 * One key per recipe, record and occurrence: 'birthday_post:Employee:<id>:2026'. It comes from the run's
 * dedupe key without the rule id, so a recreated rule cannot post the same birthday twice.
 */
export function autoPostKey(recipeKey: string | null | undefined, dedupeKey: string | null | undefined, runId: string): string {
  const occurrence = dedupeKey ? dedupeKey.split(':').slice(1).join(':') : `run:${runId}`
  return `${recipeKey || 'custom'}:${occurrence}`
}

export type AutoPostInput = Readonly<{
  type: FeedPostType
  title: string
  message: string
  authorId: unknown
  /** The celebrated person or the new joiner, when they have a login. */
  featuredId?: unknown
  key: string
  now: Date
}>

/** The Post document (without orgId) for an automatic post: everyone sees it, nobody is notified. */
export function autoPostDoc(input: AutoPostInput): Record<string, unknown> {
  const title = input.title.trim().slice(0, TITLE_MAX) || (input.type === 'welcome' ? 'Welcome to the team' : 'Something to celebrate')
  return {
    authorId: input.authorId,
    title,
    message: input.message.trim().slice(0, MESSAGE_MAX) || title,
    category: input.type,
    priority: 'medium',
    audience: 'org',
    targetRoles: [],
    mentionIds: [],
    featuredIds: input.featuredId ? [input.featuredId] : [],
    published: true,
    autoKey: input.key,
    lastActivityAt: input.now,
  }
}
