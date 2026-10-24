import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { Banknote, ListChecks, Plus, ReceiptIndianRupee, Wallet, X } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { buildHref, first, parseListParams, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { FilterSelect } from '@/components/folio/FilterSelect'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { PeriodPicker } from '@/components/folio/PeriodPicker'
import { EMBEDDED_TABLE, Note, TableCard } from '@/components/folio/ui'
import { resolvePeriod } from '@/modules/folio/engine/period'
import { clientNameMap, firmContext } from '@/modules/folio/queries/common'
import { listReceipts, type ReceiptListRow } from '@/modules/folio/receipts/queries'
import { RECEIPT_MODE_LABELS, RECEIPT_MODES, type ReceiptMode } from '@/modules/folio/receipts/rules'
import { PAGE_SIZE } from '@/modules/folio/types'
import { FilterTabs } from './_components/filter-tabs'
import { ReceiptStatusBadge } from './_components/receipt-badge'

export const metadata: Metadata = { title: 'Receipts' }

const BASE = '/app/folio/receipts'

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const today = todayIST()
  const period = resolvePeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }, today, 'all')
  const { firms, firm } = await firmContext(ctx, first(sp.firm))
  // The firm filter and the period feed the existing entity/from/to filters of the list query.
  const p = parseListParams({ ...sp, entity: firm?.id ?? first(sp.entity), from: period.from ?? undefined, to: period.to ?? undefined }, { pageSize: PAGE_SIZE })
  const { rows, total, receivedPaise, unappliedPaise, entities } = await listReceipts(ctx, p)
  const unallocated = p.get('unallocated') === '1'
  const filtered = Boolean(p.q || p.get('client') || p.get('mode') || p.get('status') || period.key !== 'all' || unallocated)
  const canWrite = ctx.can('receipts.write')
  const clientParam = p.get('client')
  const clientFilter = clientParam && isValidObjectId(clientParam) ? ((await clientNameMap(ctx, [clientParam])).get(clientParam) ?? null) : null
  const recordHref = p.get('client') ? `${BASE}/new?clientId=${p.get('client')}` : `${BASE}/new`

  const columns: Column<ReceiptListRow>[] = [
    { key: 'number', header: 'Receipt', className: 'whitespace-nowrap', cell: (r) => <span className="inline-flex items-center gap-2">{r.number}{r.status !== 'recorded' ? <ReceiptStatusBadge status={r.status} /> : null}</span> },
    { key: 'client', header: 'Client', className: 'min-w-[160px]', cell: (r) => <Link href={`/app/folio/ledger/${r.clientId}`} className="text-white/85 transition-colors hover:text-blush">{r.clientName}</Link> },
    ...(entities.length > 1 && !firm ? [{ key: 'entity', header: 'Firm', hideOnMobile: true, cell: (r: ReceiptListRow) => <Badge tone="neutral">{r.entityCode}</Badge> }] : []),
    { key: 'receivedOn', header: 'Received', className: 'whitespace-nowrap', cell: (r) => <span className="text-[#979797]">{formatDate(r.receivedOn)}</span> },
    // Mode and reference share a column so eight columns fit the content width without a sideways scroll.
    {
      key: 'reference',
      header: 'Mode · reference',
      hideOnMobile: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap">{RECEIPT_MODE_LABELS[r.mode as ReceiptMode] ?? r.mode}</span>
          {r.reference ? <span className="break-all text-xs text-fg-2">{r.reference}</span> : null}
        </span>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', className: 'whitespace-nowrap', cell: (r) => <span className={r.status === 'recorded' ? 'tabular-nums text-fg' : 'tabular-nums text-fg-3 line-through'}>{formatINR(r.amountPaise)}</span> },
    { key: 'unapplied', header: 'Unapplied', align: 'right', className: 'whitespace-nowrap', cell: (r) => (r.unappliedPaise > 0 ? <span className="tabular-nums text-warning">{formatINR(r.unappliedPaise)}</span> : <span className="text-fg-3">—</span>) },
  ]

  const empty = unallocated && !p.q ? (
    <EmptyState icon={<Wallet />} title="Everything is applied" description="Every payment has been matched to an invoice." compact />
  ) : filtered ? (
    <EmptyState icon={<ReceiptIndianRupee />} title="No payments match these filters" action={<Button size="sm" variant="secondary" href={buildHref(BASE, {}, { firm: firm?.code })}>Clear filters</Button>} compact />
  ) : (
    <EmptyState icon={<ReceiptIndianRupee />} title="No payments recorded yet" description="Record the first payment as it lands." action={canWrite ? <Button variant="primary" icon={<Plus className="size-4" />} href={recordHref}>Record payment</Button> : undefined} compact />
  )

  return (
    <>
      <PageHeader
        title={unallocated ? 'Unapplied payments' : 'Receipts'}
        description={`${formatINR(receivedPaise)} received ${period.key === 'all' ? 'to date' : `${period.noun} (${period.window})`}${firm ? ` into ${firm.name}` : ''} · ${formatINR(unappliedPaise)} of it not yet applied.`}
        icon={<ReceiptIndianRupee />}
        actions={canWrite ? <Button variant="primary" icon={<Banknote className="size-4" />} href={recordHref}>Record payment</Button> : null}
      >
        <div className="flex flex-wrap items-center gap-3">
          <FirmSwitch base={BASE} params={sp} firms={firms} firm={firm} clear={['entity']} />
          <PeriodPicker base={BASE} params={sp} period={period} today={today} allowAll />
        </div>
      </PageHeader>

      {unallocated ? (
        <Note className="mb-4" icon={<Wallet />}>
          Money in the bank that no invoice knows about. These are advances and part payments. Applying them to an invoice is what makes the outstanding figure honest.
        </Note>
      ) : null}

      <TableCard
        icon={<ListChecks />}
        title={unallocated ? 'Unapplied payments' : 'All receipts'}
        subtitle={`Showing ${total} ${total === 1 ? 'payment' : 'payments'}`}
        actions={
          <FilterTabs
            label="Receipt filter"
            tabs={[
              { href: buildHref(BASE, sp, { status: undefined, unallocated: undefined, page: undefined }), label: 'All', active: !unallocated && !p.get('status') },
              { href: buildHref(BASE, sp, { unallocated: '1', status: undefined, page: undefined }), label: 'Unapplied only', active: unallocated },
              { href: buildHref(BASE, sp, { status: 'bounced', unallocated: undefined, page: undefined }), label: 'Bounced', active: p.get('status') === 'bounced' },
              { href: buildHref(BASE, sp, { status: 'cancelled', unallocated: undefined, page: undefined }), label: 'Cancelled', active: p.get('status') === 'cancelled' },
            ]}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-[23px] pb-4">
          <SearchInput placeholder="Number, reference or client" />
          <FilterSelect param="mode" placeholder="Any mode" options={RECEIPT_MODES.map((m) => ({ value: m, label: RECEIPT_MODE_LABELS[m] }))} />
          {clientFilter ? (
            <Link href={buildHref(BASE, sp, { client: undefined, page: undefined })} className="inline-flex h-[33px] items-center gap-1.5 rounded-full bg-chip-active px-3.5 text-[13px] text-white transition-colors hover:bg-[#61428a]">
              Client: {clientFilter} <X className="size-3.5" strokeWidth={1.5} />
            </Link>
          ) : null}
        </div>
        <DataTable className={EMBEDDED_TABLE} columns={columns} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `${BASE}/${r.id}`} basePath={BASE} params={sp} empty={empty} />
      </TableCard>
      <Pagination page={p.page} pageSize={p.pageSize} total={total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
