/**
 * Scheduled posts (pure). The composer sends a local IST time
 * ('2026-10-20T09:30'); a time in the next minute or the past publishes now,
 * a later one waits for the posts cron (every 15 minutes), up to 90 days out.
 */

export const MAX_SCHEDULE_DAYS = 90
const DAY_MS = 86_400_000
const NOW_SLACK_MS = 60_000

/** 'YYYY-MM-DDTHH:MM' in Asia/Kolkata as an instant, or null when malformed. */
export function istLocalToDate(value: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value.trim())
  if (!m) return null
  const date = new Date(`${m[1]}T${m[2]}:00+05:30`)
  return Number.isNaN(date.getTime()) ? null : date
}

export type PublishPlan = { ok: true; published: boolean; publishAt?: Date } | { ok: false; error: string }

/** Publish now (no time, or a time that has come) or later (scheduled), refusing times too far out. */
export function publishPlan(publishAt: Date | null | undefined, now: Date): PublishPlan {
  if (!publishAt || publishAt.getTime() <= now.getTime() + NOW_SLACK_MS) return { ok: true, published: true }
  if (publishAt.getTime() - now.getTime() > MAX_SCHEDULE_DAYS * DAY_MS) return { ok: false, error: `Schedule at most ${MAX_SCHEDULE_DAYS} days ahead.` }
  return { ok: true, published: false, publishAt }
}

/** A scheduled post is due when it is unpublished and its time has come. */
export const isDue = (post: { published?: boolean | null; publishAt?: Date | null }, now: Date): boolean =>
  post.published === false && Boolean(post.publishAt) && post.publishAt!.getTime() <= now.getTime()

/** Mongo filter of scheduled posts due now (the cron's query). */
export const duePostsFilter = (now: Date) => ({ published: false, publishAt: { $lte: now }, deletedAt: null })

/** Feed visibility: published posts, plus my own scheduled ones. */
export const visibleNowFilter = (memberId: unknown) => ({ $or: [{ published: { $ne: false } }, { authorId: memberId }] })
