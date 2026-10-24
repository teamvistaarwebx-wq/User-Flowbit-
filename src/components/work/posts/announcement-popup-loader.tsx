import type { Ctx } from '@/lib/ctx'
import { unreadAnnouncements } from '@/modules/work/posts/queries'
import { AnnouncementPopup } from './announcement-popup'

/** Server half of the unread-announcement popup: loads the list, renders nothing when it is empty. */
export async function AnnouncementPopupLoader({ ctx }: { ctx: Ctx }) {
  const items = await unreadAnnouncements(ctx).catch((error) => {
    console.error('[posts] unread announcements failed', { orgId: String(ctx.orgId) }, error)
    return []
  })
  return items.length ? <AnnouncementPopup items={items} /> : null
}
