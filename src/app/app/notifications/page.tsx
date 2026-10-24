import type { Metadata } from 'next'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { breadcrumbFor, PRODUCTS, type IconName } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { buildHref, parseListParams, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { MarkAllRead, NotificationFeed, type FeedItem } from '@/components/work/notifications/notification-feed'
import { PillLinks } from '@/components/work/tasks/pill-links'
import { Notification } from '@/models/Notification'
import { eventPrefixesOf, groupByDay, notificationArea, whenInDayGroup, type NotificationArea } from '@/modules/settings/format'

export const metadata: Metadata = { title: 'Notifications' }
const BASE = '/app/notifications'
const AREAS: NotificationArea[] = ['work', 'muster', 'orbit', 'folio', 'workspace']
const PRODUCT_AREAS = ['work', 'muster', 'orbit', 'folio'] as const
const AREA_LABEL: Record<NotificationArea, string> = { work: 'Work', muster: 'Muster', orbit: 'Orbit', folio: 'Folio', workspace: 'Workspace' }

const eventRegex = (area: NotificationArea) => new RegExp(`^(${eventPrefixesOf(area).map(escapeRegex).join('|')})\\.`)

function areaFilter(area: NotificationArea | undefined): Record<string, unknown> {
  if (!area) return {}
  if (area === 'workspace') return { product: { $nin: [...PRODUCT_AREAS] }, $nor: PRODUCT_AREAS.map((a) => ({ event: eventRegex(a) })) }
  return { $or: [{ product: area }, { product: { $in: [null, ''] }, event: eventRegex(area) }] }
}

const look = (area: NotificationArea): { icon: IconName; accentVar: string } =>
  area === 'workspace' ? { icon: 'Bell', accentVar: '--orchid' } : { icon: PRODUCTS[area].icon, accentVar: PRODUCTS[area].accentVar }

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember()
  const p = parseListParams(sp, { pageSize: 30 })
  const unreadOnly = p.get('tab') === 'unread'
  const kind = p.get('kind') as NotificationArea | undefined
  const area = kind && AREAS.includes(kind) ? kind : undefined
  const filter = { userId: ctx.userId, ...(unreadOnly ? { readAt: null } : {}), ...areaFilter(area) }
  const Notes = ctx.db(Notification)
  const [rows, total, unread] = await Promise.all([
    Notes.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
    Notes.countDocuments(filter),
    Notes.countDocuments({ userId: ctx.userId, readAt: null }),
  ])
  const items: (FeedItem & { createdAt: Date })[] = rows.map((n) => {
    const a = notificationArea(n)
    const unreadRow = !n.readAt
    return {
      id: String(n._id),
      title: n.title,
      body: n.body ?? '',
      href: n.href ?? '',
      when: whenInDayGroup(n.createdAt),
      unread: unreadRow,
      problem: unreadRow && (/(rejected|failed|halted|overdue)/.test(n.event ?? '') || n.kind === 'warning'),
      createdAt: n.createdAt,
      ...look(a),
    }
  })
  const groups = groupByDay(items)

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`Assignments, approvals and mentions for you in ${ctx.org.name}. Choose what reaches you, and where, in My alerts.`}
        breadcrumb={breadcrumbFor(BASE)}
        icon={<Bell />}
        help="alerts-digests-briefs"
        actions={
          <>
            {unread ? <MarkAllRead /> : null}
            <Link href="/app/approvals" className={buttonClass('secondary', 'sm')}>
              Approvals
            </Link>
            <Link href="/app/settings/profile/notifications" className={buttonClass('ghost', 'sm')}>
              My alerts
            </Link>
          </>
        }
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <PillLinks
            items={[
              { href: buildHref(BASE, sp, { tab: undefined, page: undefined }), label: 'All', active: !unreadOnly },
              { href: buildHref(BASE, sp, { tab: 'unread', page: undefined }), label: 'Unread', active: unreadOnly, count: unread || undefined },
            ]}
          />
          <PillLinks
            items={[
              { href: buildHref(BASE, sp, { kind: undefined, page: undefined }), label: 'All products', active: !area },
              ...AREAS.map((a) => ({ href: buildHref(BASE, sp, { kind: a, page: undefined }), label: AREA_LABEL[a], active: area === a })),
            ]}
          />
        </div>
      </PageHeader>
      {items.length ? (
        <>
          <NotificationFeed groups={groups} />
          <Pagination page={p.page} pageSize={p.pageSize} total={total} basePath={BASE} params={sp} />
        </>
      ) : (
        <div className="card-table">
          <EmptyState
            icon={<Bell />}
            title={unreadOnly ? "You're all caught up." : area ? `No ${AREA_LABEL[area]} notifications.` : 'Nothing yet'}
            description={unreadOnly || area ? undefined : 'When someone assigns you a task, mentions you, or your leave or claim is decided, it shows up here.'}
          />
        </div>
      )}
      <p className="mt-6 text-center text-[13px] text-fg-2">Only yours. Nobody else can see your notifications.</p>
    </>
  )
}
