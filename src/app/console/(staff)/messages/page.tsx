import type { Metadata } from 'next'
import Link from 'next/link'
import { MessagesSquare, Send } from 'lucide-react'
import { requireStaff } from '@/lib/console/session'
import { whatsAppEnabled } from '@/modules/features/flags'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { FilterPills } from '@/components/settings/filter-pills'
import { Notice, StatusWord, TableCard } from '@/components/settings/surface'
import { Message } from '@/models/messaging/Message'
import { Org } from '@/models/Org'
import { WaConversation } from '@/models/whatsapp/WaConversation'
import { isWhatsAppConfigured } from '@/modules/whatsapp/platform-sender'
import { formatPhone } from '@/modules/whatsapp/phone'

export const metadata: Metadata = { title: 'Messages' }

const BILLING_KINDS = ['subscription', 'subscription_invoice']

/** Console Messages (console spec 7.2, 10): the WhatsApp inbox of Flowbit's own number and the delivery log of billing messages. */
export default async function ConsoleMessagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await requireStaff('accounts.view')
  const sp = await searchParams
  const whatsappOn = await whatsAppEnabled()
  // While WhatsApp is off (lib/feature-flags) only the delivery log shows.
  const tab = first(sp.tab) === 'log' || !whatsappOn ? 'log' : 'inbox'
  const showClosed = first(sp.closed) === '1'
  const [conversations, log] = await Promise.all([
    tab === 'inbox' ? p.raw(WaConversation).find(showClosed ? {} : { status: 'open' }).sort({ lastMessageAt: -1 }).limit(100).lean() : Promise.resolve([]),
    tab === 'log' ? p.raw(Message).find({ kind: { $in: BILLING_KINDS } }, { channel: 1, to: 1, subject: 1, title: 1, status: 1, orgId: 1, createdAt: 1, cost: 1, error: 1, event: 1 }).sort({ createdAt: -1 }).limit(150).lean() : Promise.resolve([]),
  ])
  const orgs = tab === 'log' ? await p.raw(Org).find({ _id: { $in: log.map((m) => m.orgId).filter(Boolean) } }, { name: 1 }).lean() : []
  const orgName = (id: unknown) => orgs.find((o) => String(o._id) === String(id))?.name ?? '—'
  return (
    <>
      <PageHeader title="Messages" description={whatsappOn ? "WhatsApp inbox of Flowbit's own number, and the delivery log of billing messages." : 'The delivery log of billing messages.'}>
        {whatsappOn ? <FilterPills label="Messages sections" items={[{ href: '/console/messages', label: 'WhatsApp inbox', active: tab === 'inbox' }, { href: buildHref('/console/messages', {}, { tab: 'log' }), label: 'Delivery log', active: tab === 'log' }]} /> : null}
      </PageHeader>
      {whatsappOn && !isWhatsAppConfigured() ? <Notice tone="warning" className="mb-4">WhatsApp is not connected (INTERAKT_API_KEY is not set). Bills and reminders go by email only.</Notice> : null}
      {tab === 'inbox' ? (
        <TableCard icon={<MessagesSquare strokeWidth={1.5} />} label="Inbox" description="Unassigned conversations get an auto-reply pointing to email once a day." actions={<Link href={buildHref('/console/messages', {}, { closed: showClosed ? undefined : '1' })} className="text-sm text-fg-2 hover:text-white">{showClosed ? 'Hide closed' : 'Show closed'}</Link>}>
          {conversations.length ? (
            <ul className="border-t border-line">
              {conversations.map((c) => (
                <li key={String(c._id)}>
                  <Link href={`/console/messages/${c._id}`} className="flex items-center justify-between gap-3 px-[23px] py-3 transition-colors hover:bg-white/[0.04]">
                    <span className="min-w-0">
                      <span className={cn('block text-sm', c.unread ? 'font-semibold text-white' : 'text-white')}>{c.name ? `${c.name} · ` : ''}{formatPhone(c.phone)}{c.stoppedAt ? ' · STOP' : ''}</span>
                      <span className="block truncate text-xs text-[#979797]">{c.lastText}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-[#979797]">
                      <span className="block">{timeAgo(c.lastMessageAt)}</span>
                      <span className="block">{c.assignedName ?? 'Unassigned'}{c.unread ? ` · ${c.unread} new` : ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="border-t border-line"><EmptyState compact icon={<MessagesSquare />} title="No WhatsApp messages yet." /></div>}
        </TableCard>
      ) : (
        <TableCard icon={<Send strokeWidth={1.5} />} label="Delivery log" description="Bills, reminders and receipts Flowbit sent, newest first">
          {log.length ? (
            <ul className="border-t border-line">
              {log.map((m) => (
                <li key={String(m._id)} className="flex flex-col gap-1 px-[23px] py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 text-sm"><span className="block truncate text-white">{m.subject || m.title || m.event}</span><span className="block text-xs text-[#979797]">{m.channel} · {orgName(m.orgId)} · {m.to.join(', ')}{m.cost ? ` · ₹${(m.cost / 100).toFixed(3)}` : ''}{m.error ? ` · ${m.error}` : ''}</span></span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-[#979797]"><StatusWord status={m.status} />{formatDateTime(m.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : <div className="border-t border-line"><EmptyState compact icon={<Send />} title="Nothing sent yet." /></div>}
        </TableCard>
      )}
    </>
  )
}
