import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Banknote, BookOpen, CalendarDays, CalendarRange, FilePlus2, Settings2 } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatMonth, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatementExports, StatementTable } from '@/components/folio/ClientLedgerTab'
import { LINK, TableCard, Td, Th, TBODY_ROW, THEAD_ROW } from '@/components/folio/ui'
import { recipientsFor } from '@/modules/folio/collections/recipients'
import { profileSummaries } from '@/modules/folio/queries/common'
import { clientStatement } from '@/modules/folio/queries/ledger'
import { ledgerIndex } from '@/modules/folio/queries/ledger-index'
import { FilterTabs } from '../../receipts/_components/filter-tabs'
import { RangeForm } from '../../receipts/_components/range-form'
import { ClientSwitcher, EmailStatementDialog } from '../_components/ledger-controls'
import { SendWhatsAppDialog } from '@/components/whatsapp/send-whatsapp-dialog'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Ledger' }

const isIso = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v))

export default async function ClientLedgerPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ clientId }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const from = isIso(first(sp.from)) ? first(sp.from)! : null
  const to = isIso(first(sp.to)) ? first(sp.to)! : todayIST()
  const data = await clientStatement(ctx, clientId, { from, to })
  if (!data) notFound()
  const view = first(sp.view) === 'monthly' ? 'monthly' : 'statement'
  const base = `/app/folio/ledger/${clientId}`
  const [others, profiles, recipients] = await Promise.all([ledgerIndex(ctx), profileSummaries(ctx, [clientId]), recipientsFor(ctx, clientId)])
  const profile = profiles.get(clientId)
  const switcher = others.some((o) => o.clientId === clientId) ? others : [{ clientId, clientName: data.client.name }, ...others]
  const keepQuery = new URLSearchParams(Object.entries({ from: first(sp.from), to: first(sp.to), view: first(sp.view) }).filter((e): e is [string, string] => Boolean(e[1]))).toString()
  const statementSpan = from ? `${formatDate(from)} to ${formatDate(to)}` : `As at ${formatDate(to)}`
  const facts = [
    profile?.termsDays != null ? `${profile.termsDays}-day terms` : 'Firm default terms',
    profile?.tds.on ? `TDS ${profile.tds.percent}%${profile.tds.section ? ` (${profile.tds.section})` : ''}` : 'No TDS',
    profile?.creditLimitPaise != null ? `Credit limit ${formatINR(profile.creditLimitPaise, { decimals: 0 })}` : 'No credit limit',
  ]

  return (
    <>
      <PageHeader
        title={data.client.name}
        description={facts.join(' · ')}
        back={{ href: '/app/folio/ledger', label: 'Ledgers' }}
        icon={<BookOpen />}
        actions={
          <>
            <ClientSwitcher clients={switcher.map((o) => ({ id: o.clientId, name: o.clientName }))} current={clientId} query={keepQuery} />
            {ctx.can('clients.read') ? <Button variant="ghost" size="sm" icon={<Settings2 className="size-4" />} href={`/app/clients/${clientId}`}>Billing settings</Button> : null}
          </>
        }
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <FilterTabs label="Ledger view" tabs={[{ href: buildHref(base, sp, { view: undefined }), label: 'Statement', active: view === 'statement' }, { href: buildHref(base, sp, { view: 'monthly' }), label: 'Monthly', active: view === 'monthly' }]} />
          <RangeForm path={base} params={sp} keep={['view']} defaults={{ to }} max={todayIST()} />
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2 empty:hidden">
        {ctx.can('collections.write') ? <EmailStatementDialog clientId={clientId} clientName={data.client.name} from={from} to={to} recipients={recipients.filter((r) => r.email).map((r) => ({ id: r.id, name: r.name, email: r.email as string }))} /> : null}
        {ctx.can('collections.write') ? <SendWhatsAppDialog kind="statement" id={clientId} title={`Send ${data.client.name}'s statement on WhatsApp`} /> : null}
        {ctx.can('receipts.write') ? <Button size="sm" variant="secondary" icon={<Banknote className="size-4" />} href={`/app/folio/receipts/new?clientId=${clientId}`}>Record payment</Button> : null}
        {ctx.can('invoices.write') ? <Button size="sm" variant="primary" icon={<FilePlus2 className="size-4" />} href={`/app/folio/invoices/new?clientId=${clientId}`}>New invoice</Button> : null}
      </div>

      {view === 'statement' ? (
        <StatementTable statement={data.statement} clientName={data.client.name} subtitle={statementSpan} actions={<StatementExports clientId={clientId} from={from} to={to} />} />
      ) : (
        <TableCard icon={<CalendarRange />} title="Month by month" subtitle="Opening is the previous month’s closing. Newest first." actions={<StatementExports clientId={clientId} from={from} to={to} />}>
          {data.monthly.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className={THEAD_ROW}>
                    <Th icon={<CalendarDays />}>Month</Th>
                    <Th align="right">Opening</Th>
                    <Th align="right">Billed</Th>
                    <Th align="right">Received</Th>
                    <Th align="right">Closing</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr aria-hidden className="h-1.5" />
                  {data.monthly.map((m) => (
                    <tr key={m.month} className={TBODY_ROW}>
                      <Td><Link className={LINK} href={buildHref(base, {}, { from: `${m.month}-01`, to: undefined })}>{formatMonth(m.month)}</Link></Td>
                      <Td align="right" className="tabular-nums text-white/75">{formatINR(m.openingPaise)}</Td>
                      <Td align="right" className="tabular-nums">{formatINR(m.billedPaise)}</Td>
                      <Td align="right" className="tabular-nums text-[#2DCBAF]">{formatINR(m.settledPaise)}</Td>
                      <Td align="right" className="font-medium tabular-nums">{formatINR(m.closingPaise)}</Td>
                    </tr>
                  ))}
                  <tr aria-hidden className="h-2" />
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line">
              <EmptyState icon={<BookOpen />} title="Nothing billed or received yet" compact />
            </div>
          )}
        </TableCard>
      )}
      <p className="mt-4 text-xs text-fg-2">Statement for {data.client.name}{from ? ` from ${formatDate(from)}` : ''} to {formatDate(to)}. Bounced and cancelled payments are left out; they stay visible on the receipts list.</p>
    </>
  )
}
