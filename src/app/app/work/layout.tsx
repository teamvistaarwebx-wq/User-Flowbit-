import { Suspense, type ReactNode } from 'react'
import { getCtx, isBlocked } from '@/lib/ctx'
import { AnnouncementPopupLoader } from '@/components/work/posts/announcement-popup-loader'

/**
 * Work pages: the unread-announcement popup also shows when the app opens on a Work page (Home mounts its own).
 * It streams in on its own, so the page never waits for the announcements query.
 */
export default async function WorkLayout({ children }: { children: ReactNode }) {
  const ctx = await getCtx()
  return (
    <>
      {children}
      {ctx && !isBlocked(ctx) && ctx.has('work') ? (
        <Suspense fallback={null}>
          <AnnouncementPopupLoader ctx={ctx} />
        </Suspense>
      ) : null}
    </>
  )
}
