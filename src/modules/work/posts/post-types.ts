import type { Tone } from '@/lib/status'

/**
 * Post types (pure, client-safe): label, tint and who may use each. The icon
 * for each type is in components/work/posts/post-type-icon. Older posts may
 * carry a pre-v2.1 category ('discussion', 'idea'); postTypeOf reads them as
 * questions, the closest new type.
 */

export const POST_TYPES = ['announcement', 'update', 'kudos', 'celebration', 'policy', 'question', 'poll', 'win', 'welcome', 'event'] as const
export type PostType = (typeof POST_TYPES)[number]
/** Categories before v2.1 (read as questions; scripts/migrate-post-types.ts rewrites them). */
export const LEGACY_POST_TYPES = ['discussion', 'idea'] as const

export type PostTypeMeta = Readonly<{
  label: string
  /** Filter chip label (plural). */
  plural: string
  tone: Tone
  /** Hint under the type picker. */
  hint: string
  /** Only moderators (posts.manage) may publish it. */
  moderatorOnly?: boolean
  /** Written by the automations engine; members cannot pick it. */
  automatic?: boolean
}>

export const POST_TYPE_META: Readonly<Record<PostType, PostTypeMeta>> = {
  announcement: { label: 'Announcement', plural: 'Announcements', tone: 'violet', hint: 'Reaches everyone in the audience with a notification and a pop-up.', moderatorOnly: true },
  update: { label: 'Update', plural: 'Updates', tone: 'info', hint: 'An FYI: progress, news or a quick note.' },
  kudos: { label: 'Kudos', plural: 'Kudos', tone: 'pink', hint: 'Thank one or more people. Their manager hears about it too.' },
  celebration: { label: 'Celebration', plural: 'Celebrations', tone: 'orange', hint: 'Birthdays, anniversaries and other good news.' },
  policy: { label: 'Policy', plural: 'Policies', tone: 'warning', hint: 'Everyone in the audience is asked to confirm they have read it.', moderatorOnly: true },
  question: { label: 'Question', plural: 'Questions', tone: 'neutral', hint: 'Ask the team; answers come as replies.' },
  poll: { label: 'Poll', plural: 'Polls', tone: 'orchid', hint: 'Let people vote on two to eight options.' },
  win: { label: 'Win', plural: 'Wins', tone: 'success', hint: 'A deal closed, a launch shipped, a goal met.' },
  welcome: { label: 'Welcome', plural: 'Welcomes', tone: 'pink', hint: 'Introduce someone who just joined.' },
  event: { label: 'Event', plural: 'Events', tone: 'info', hint: 'An offsite, a lunch or a town hall, with a date and place.' },
}

const LEGACY: Readonly<Record<string, PostType>> = { discussion: 'question', idea: 'question' }

/** The post type of a stored category (old categories map to their new type). */
export const postTypeOf = (category: string | null | undefined): PostType =>
  (POST_TYPES as readonly string[]).includes(category ?? '') ? (category as PostType) : (LEGACY[category ?? ''] ?? 'update')

/** The stored categories a type filter matches (questions include the old discussions and ideas). */
export const categoriesFor = (type: PostType): string[] => [type, ...Object.entries(LEGACY).filter(([, t]) => t === type).map(([k]) => k)]

/** Types a member may pick in the composer. */
export const pickableTypes = (isModerator: boolean): PostType[] => POST_TYPES.filter((t) => isModerator || !POST_TYPE_META[t].moderatorOnly)

/** Types whose people field (featuredIds) is required: who the kudos or welcome is for. */
export const needsFeatured = (type: PostType): boolean => type === 'kudos' || type === 'welcome'

/** Types that notify their whole audience when published. */
export const notifiesAudience = (type: PostType): boolean => type === 'announcement' || type === 'policy'
