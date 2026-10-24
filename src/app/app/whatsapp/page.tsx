import type { Metadata } from 'next'
import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { requireWhatsAppPage } from '@/modules/features/flags'
import { timeAgo } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { FilterPills } from '@/components/settings/filter-pills'
import { Notice, TableCard } from '@/components/settings/surface'
import { WaThread } from '@/models/whatsapp/WaThread'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { formatPhone } from '@/modules/whatsapp/phone'

export const metadata: Metadata = { title: 'WhatsApp inbox' }

const MATCH_LABEL: Record<string, string> = { client: 'Client', lead: 'Lead', member: 'Team' }

/** The workspace's WhatsApp inbox (notifications-v2 §2.4): chats with the workspace's own number. */
export default async function WhatsAppInboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember({ perm: 'clients.read' })
  await requireWhatsAppPage()
  const sp = await searchParams
  const view = first(sp.view) === 'mine' ? 'mine' : first(sp.view) === 'closed' ? 'closed' : 'open'
  const filter = view === 'closed' ? { status: 'closed' } : view === 'mine' ? { status: 'open', assignedTo: ctx.memberId } : { status: 'open' }
  const [threads, connected] = await Promise.all([ctx.db(WaThread).find(filter).sort({ lastMessageAt: -1 }).limit(200).lean(), isWhatsAppConnected(ctx.orgId)])
  return (
    <>
      <PageHeader title="WhatsApp inbox" description="Messages to your WhatsApp number. Unknown numbers become Orbit leads with source WhatsApp.">
        <FilterPills label="Inbox views" items={[{ href: '/app/whatsapp', label: 'Open', active: view === 'open' }, { href: buildHref('/app/whatsapp', {}, { view: 'mine' }), label: 'Assigned to me', active: view === 'mine' }, { href: buildHref('/app/whatsapp', {}, { view: 'closed' }), label: 'Closed', active: view === 'closed' }]} />
      </PageHeader>
      {!connected ? <Notice tone="warning" className="mb-4">WhatsApp is not connected, so no new messages arrive here. <Link href="/app/settings/integrations/whatsapp" className="text-link hover:underline">Connect it</Link>.</Notice> : null}
      <TableCard icon={<MessagesSquare strokeWidth={1.5} />} label="Chats" description="Free replies are allowed for 24 hours after a person's last message; after that only an approved template.">
        {threads.length ? (
          <ul className="border-t border-line">
            {threads.map((t) => (
              <li key={String(t._id)}>
                <Link href={`/app/whatsapp/${t._id}`} className="flex items-center justify-between gap-3 px-[23px] py-3 transition-colors hover:bg-white/[0.04]">
                  <span className="min-w-0">
                    <span className={cn('block text-sm text-white', t.unread ? 'font-semibold' : '')}>{t.match?.label ?? t.name ?? formatPhone(t.phone)}{t.match?.kind ? <span className="ml-2 text-xs font-normal text-[#979797]">{MATCH_LABEL[t.match.kind]}</span> : null}{t.stoppedAt ? ' · STOP' : ''}</span>
                    <span className="block truncate text-xs text-[#979797]">{t.lastText}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-[#979797]">
                    <span className="block">{timeAgo(t.lastMessageAt)}</span>
                    <span className="block">{t.assignedName ?? 'Unassigned'}{t.unread ? ` · ${t.unread} new` : ''}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-line"><EmptyState compact icon={<MessagesSquare />} title="No WhatsApp chats here." /></div>
        )}
      </TableCard>
    </>
  )
}
