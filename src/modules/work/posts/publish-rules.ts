import type { OrgLike } from '@/lib/plans'
import { inactiveWorkspaceNote } from '@/modules/automations/run-status'
import { POST_TYPE_META, postTypeOf } from './post-types'

/**
 * Whether a scheduled post may still go out when the posts cron reaches it (pure, R3 L-21b).
 * The checks the composer ran at scheduling time are run again: the workspace must still be
 * active, the author still an active member, and an announcement or policy author still a moderator.
 */

export type ScheduledAuthor = Readonly<{ status?: string | null; canModerate: boolean }>

/** Why the scheduled post must not publish, or null when it may. */
export function scheduledPublishRefusal(org: OrgLike | null | undefined, author: ScheduledAuthor | null, category: string, now: Date): string | null {
  const inactive = inactiveWorkspaceNote(org, now)
  if (inactive) return inactive
  if (!author || author.status !== 'active') return 'The author is no longer an active member, so the post was not published.'
  if (POST_TYPE_META[postTypeOf(category)].moderatorOnly && !author.canModerate) return 'The author can no longer post this type, so the post was not published.'
  return null
}
