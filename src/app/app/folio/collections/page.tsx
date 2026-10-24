import type { Metadata } from 'next'
import Link from 'next/link'
import { AlarmClock, Banknote, BellRing, Building2, CalendarDays, FileText, Hourglass, IndianRupee, ListTodo, Mail, MessageCircle, PhoneCall, Plus, X } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { statusLabel } from '@/lib/status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { AgingBar, AgingPill } from '@/components/folio/AgingBar'
import { HeroCard, LINK, PanelHeader, TableCard, Td, Th, TBODY_ROW, THEAD_ROW } from '@/components/folio/ui'
import { cn } from '@/lib/utils'
import { FollowupActions, NewFollowupDialog } from '@/components/folio/FollowupActions'
import { ReminderDialog } from '@/components/folio/ReminderDialog'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { asOfLabel } from '@/modules/folio/engine/period'
import { firmContext } from '@/modules/folio/queries/common'
import { AGING_LABELS } from '@/modules/folio/engine/aging'
import { collectionsPage, followupOptions } from '@/modules/folio/collections/queries'
import { FilterTabs } from '../receipts/_components/filter-tabs'
import { WhatsAppQueueActions } from './_components/whatsapp-queue'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Collections' }

const BASE = '/app/folio/collections'

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const mine = first(sp.mine) !== '0'
  const clientId = first(sp.client)
  const canAct = ctx.can('collections.write')
  const { firms, firm } = await firmContext(ctx, first(sp.firm))
  const [d, options] = await Promise.all([collectionsPage(ctx, { mine, clientId, entityId: firm?.id ?? null }), canAct ? followupOptions(ctx) : Promise.resolve(null)])
  const asOf = asOfLabel(todayIST())
  const overduePaise = d.overdue.reduce((s, r) => s + r.balancePaise, 0)
  const over60 = d.aging['61_90'] + d.aging['90_plus']
  const clientName = clientId ? (d.overdue.find((r) => r.clientId === clientId)?.clientName ?? d.queue.find((q) => q.clientId === clientId)?.clientName ?? 'one client') : null
  const newFollowup = options ? <NewFollowupDialog options={options} defaultClientId={clientId} trigger={<Button variant="primary" icon={<Plus className="size-4" />}>New follow-up</Button>} /> : null

  return (
    <>
      <PageHeader
        title="Collections"
        description={`Who to chase today${firm ? ` for ${firm.name}` : ''}, oldest debt first. Balances ${asOf}.`}
        icon={<PhoneCall />}
        actions={
          <>
            {ctx.can('receipts.write') ? <Button variant="secondary" icon={<Banknote className="size-4" />} href={clientId ? `/app/folio/receipts/new?clientId=${clientId}` : '/app/folio/receipts/new'}>Record a payment</Button> : null}
            {newFollowup}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <FirmSwitch base={BASE} params={sp} firms={firms} firm={firm} />
          {clientName ? (
            <Link href={buildHref(BASE, sp, { client: undefined })} className="inline-flex h-[33px] items-center gap-1.5 rounded-full bg-chip-active px-3.5 text-[13px] text-white transition-colors hover:bg-[#61428a]">
              Showing {clientName} only <span className="text-white/70">· show everyone</span> <X className="size-3.5" strokeWidth={1.5} />
            </Link>
          ) : null}
        </div>
      </PageHeader>

      <div className="grid grid-cols-12 gap-4">
        <HeroCard className="col-span-12">
          <PanelHeader icon={<Hourglass />} title="Aging" subtitle={`Every open invoice by how late it is, ${asOf}`} />
          <AgingBar className="mt-4" aging={d.aging} />
        </HeroCard>

        <div className="col-span-12 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Due today" value={d.dueToday} hint={firm ? 'Follow-ups due or late, whole team, every firm' : 'Follow-ups due or late, whole team'} color="var(--warning)" />
          <StatCard label="Overdue" value={formatINRCompact(overduePaise)} hint={`${d.overdue.length} ${d.overdue.length === 1 ? 'invoice' : 'invoices'}, ${asOf}`} color="var(--danger)" />
          <StatCard label="Over 60 days" value={formatINRCompact(over60)} hint={`61–90 and 90+ days late, ${asOf}`} color="var(--absent)" />
          <StatCard label="Over 90 days" value={formatINRCompact(d.aging['90_plus'])} hint={d.aging['90_plus'] > 0 ? 'Consider writing off' : 'Nothing this old'} color="var(--danger)" />
        </div>

        <TableCard
          className="col-span-12"
          icon={<ListTodo />}
          title="Your queue today"
          subtitle={mine ? 'Follow-ups assigned to you that are due or late' : 'Every follow-up on the team that is due or late'}
          actions={<FilterTabs label="Whose queue" tabs={[{ href: buildHref(BASE, sp, { mine: undefined }), label: 'Mine', active: mine }, { href: buildHref(BASE, sp, { mine: '0' }), label: 'Everyone', active: !mine }]} />}
        >
          {d.queue.length ? (
            <ul className="border-t border-line py-1.5">
              {d.queue.map((q) => (
                <li key={q.id} className={cn('grid gap-3 px-[23px] py-2.5 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center md:gap-5', TBODY_ROW)}>
                  <div className="min-w-0">
                    <Link href={`/app/folio/ledger/${q.clientId}`} className={cn('block truncate text-sm font-medium', LINK)}>{q.clientName}</Link>
                    <p className="truncate text-xs text-fg-2">{q.subject ?? q.notes ?? 'Follow-up'}{q.assigneeName && !mine ? ` · ${q.assigneeName}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs md:flex-nowrap md:whitespace-nowrap">
                    {q.invoiceId ? <Link href={`/app/folio/invoices/${q.invoiceId}`} className={cn('text-[13px]', LINK)}>{q.invoiceNumber}</Link> : <span className="text-[13px] text-fg-2">Whole account</span>}
                    <span className="text-fg-3">{statusLabel(q.channel)}</span>
                    {q.snoozed ? <Badge tone="neutral">Snoozed</Badge> : null}
                    {q.daysLate > 0 ? <Badge tone="danger">{q.daysLate}d late</Badge> : <Badge tone="warning">Due today</Badge>}
                  </div>
                  <span className="text-sm tabular-nums text-white md:text-right">{q.balancePaise > 0 ? formatINR(q.balancePaise) : <span className="text-fg-3">—</span>}</span>
                  {canAct ? <FollowupActions id={q.id} clientName={q.clientName} today={d.today} /> : <span />}
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-line">
              <EmptyState icon={<ListTodo />} title="Nothing due. The queue is clear." description={mine ? 'Nothing assigned to you is due. Switch to Everyone to see the whole team.' : undefined} compact />
            </div>
          )}
        </TableCard>

        <TableCard className="col-span-12" icon={<AlarmClock />} title="Everything overdue" subtitle="Oldest first, then the larger balance">
          {d.overdue.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className={THEAD_ROW}>
                    <Th icon={<FileText />}>Invoice</Th>
                    <Th icon={<Building2 />}>Client</Th>
                    <Th icon={<CalendarDays />} className="hidden md:table-cell">Due</Th>
                    <Th icon={<Hourglass />}>Age</Th>
                    <Th icon={<IndianRupee />} align="right">Balance</Th>
                    <Th icon={<BellRing />} className="hidden lg:table-cell">Last reminder</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  <tr aria-hidden className="h-1.5" />
                  {d.overdue.map((r) => (
                    <tr key={r.invoiceId} className={TBODY_ROW}>
                      <Td className="whitespace-nowrap">{r.billingType === 'opening' ? <span className="text-white/75">Opening balance</span> : <Link href={`/app/folio/invoices/${r.invoiceId}`} className={cn('font-medium', LINK)}>{r.number}</Link>}</Td>
                      <Td><Link href={buildHref(BASE, sp, { client: r.clientId })} className="text-white/85 transition-colors hover:text-blush">{r.clientName}</Link></Td>
                      <Td className="hidden whitespace-nowrap text-[#FF2D31] md:table-cell">{formatDate(r.dueDate)}</Td>
                      <Td><AgingPill bucket={r.bucket}>{r.daysOverdue}d · {AGING_LABELS[r.bucket]}</AgingPill></Td>
                      <Td align="right" className="whitespace-nowrap font-medium tabular-nums">{formatINR(r.balancePaise)}</Td>
                      <Td className="hidden text-xs text-fg-2 lg:table-cell">
                        {r.lastReminderAt ? `Reminder sent ${formatDate(r.lastReminderAt, { short: true })}` : 'No reminder yet'}
                        {r.hasOpenFollowup ? <Badge tone="neutral" className="ml-2">Follow-up open</Badge> : null}
                      </Td>
                      <Td>
                        {canAct && r.billingType !== 'opening' ? (
                          <div className="flex justify-end gap-1">
                            <ReminderDialog invoiceId={r.invoiceId} invoiceNumber={r.number} trigger={<Button size="sm" variant="ghost" icon={<Mail className="size-4" />} aria-label={`Email reminder for ${r.number}`}>Email</Button>} />
                            <ReminderDialog invoiceId={r.invoiceId} invoiceNumber={r.number} defaultChannel="whatsapp" trigger={<Button size="sm" variant="ghost" icon={<MessageCircle className="size-4" />} aria-label={`WhatsApp reminder for ${r.number}`}>WhatsApp</Button>} />
                          </div>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                  <tr aria-hidden className="h-2" />
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line">
              <EmptyState icon={<AlarmClock />} title="Nothing to chase" description="Every invoice is either current or settled." compact />
            </div>
          )}
        </TableCard>

        {d.whatsapp.length ? (
          <TableCard className="col-span-12" icon={<MessageCircle />} title="WhatsApp to send" subtitle="Composed by the automatic run. Send each from WhatsApp, then mark it sent.">
            <ul className="border-t border-line py-1.5">
              {d.whatsapp.map((w) => (
                <li key={w.id} className={cn('grid gap-3 px-[23px] py-2.5 md:grid-cols-[1fr_auto] md:items-center', TBODY_ROW)}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{w.clientName}{w.invoiceNumber ? <span className="ml-2 text-xs font-normal text-fg-2">{w.invoiceNumber}</span> : null}<span className="ml-2 text-xs font-normal text-fg-3">to {w.toAddress}</span></p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-fg-2">{w.body}</p>
                  </div>
                  <WhatsAppQueueActions messageId={w.id} link={w.link} canAct={canAct} />
                </li>
              ))}
            </ul>
          </TableCard>
        ) : null}
      </div>
    </>
  )
}
