import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, ListChecks, Plus } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { FilterSelect } from '@/components/folio/FilterSelect'
import { FilterTabs } from '@/components/folio/FilterTabs'
import { SetupCallout } from '@/components/folio/SetupCallout'
import { EMBEDDED_TABLE, TableCard } from '@/components/folio/ui'
import { FolioStatus, KindBadge } from '@/components/folio/StatusBadge'
import { listQuotes, type QuoteListRow } from '@/modules/folio/quotes/queries'
import { isExpired } from '@/modules/folio/quotes/service'
import { hasAnyEntity } from '@/modules/folio/settings/queries'

export const metadata: Metadata = { title: 'Quotes' }

const BASE = '/app/folio/quotes'
const STATUSES = ['draft', 'sent', 'accepted', 'expired', 'declined', 'converted'] as const

export default async function QuotesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', anyPerm: ['folio.read', 'quotes.write'] })
  const [data, ready] = await Promise.all([listQuotes(ctx, sp), hasAnyEntity(ctx)])
  const today = todayIST()
  const canWrite = ctx.can('quotes.write') && ready
  const filtered = ['q', 'status', 'kind', 'client'].some((k) => sp[k])
  const status = first(sp.status)
  const columns: Column<QuoteListRow>[] = [
    { key: 'number', header: 'Number', cell: (r) => <span className="flex items-center gap-2"><KindBadge kind={r.kind} /><span><span className="block font-medium text-fg">{r.number}</span>{r.subject ? <span className="block max-w-[240px] truncate text-xs text-fg-2">{r.subject}</span> : null}</span></span> },
    { key: 'client', header: 'Client', cell: (r) => <Link href={`/app/clients/${r.clientId}`} className="text-white/85 transition-colors hover:text-blush">{r.clientName}</Link> },
    { key: 'quoteDate', header: 'Date', hideOnMobile: true, cell: (r) => <span className="text-[#979797]">{formatDate(r.quoteDate)}</span> },
    { key: 'validUntil', header: 'Valid until', hideOnMobile: true, cell: (r) => <span className={isExpired(r, today) ? 'text-[#FF2D31]' : 'text-[#979797]'}>{formatDate(r.validUntil)}</span> },
    { key: 'status', header: 'Status', cell: (r) => (isExpired(r, today) ? <FolioStatus status="expired" /> : <FolioStatus status={r.status} />) },
    { key: 'total', header: 'Total', align: 'right', cell: (r) => <span className="tabular-nums text-fg">{formatINR(r.totalPaise)}</span> },
  ]
  return (
    <>
      <PageHeader
        title="Quotes"
        icon={<ClipboardList />}
        breadcrumb={breadcrumbFor(BASE, ctx)}
        description="Quotations and proformas. Convert one to an invoice in a click."
        actions={canWrite ? (
          <>
            <Button variant="secondary" href={`${BASE}/new?kind=proforma`}>New proforma</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>New quote</Button>
          </>
        ) : null}
      />
      {!ready ? <SetupCallout canSetUp={ctx.can('folio.settings')} /> : null}
      <TableCard
        icon={<ListChecks />}
        title="Quotes and proformas"
        subtitle={`Showing ${data.total} ${data.total === 1 ? 'document' : 'documents'}`}
        actions={<FilterTabs label="Quote status" tabs={[{ href: BASE, label: 'All', active: !status }, ...STATUSES.map((s) => ({ href: buildHref(BASE, {}, { status: s }), label: s.charAt(0).toUpperCase() + s.slice(1), active: status === s }))]} />}
      >
        <div className="flex flex-wrap items-center gap-2 px-[23px] pb-4">
          <SearchInput placeholder="Number, subject or client" className="w-full sm:w-72" />
          <FilterSelect param="kind" placeholder="Quotes and proformas" options={[{ value: 'quote', label: 'Quotes' }, { value: 'proforma', label: 'Proformas' }]} />
        </div>
        <DataTable
          className={EMBEDDED_TABLE}
          columns={columns}
          rows={data.rows}
          rowKey={(r) => String(r._id)}
          rowHref={(r) => `${BASE}/${r._id}`}
          basePath={BASE}
          params={sp}
          empty={
            filtered ? (
              <EmptyState compact icon={<ClipboardList />} title="No quotes match these filters." description="Try another status, or clear the filters." action={<Button variant="secondary" href={BASE}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={<ClipboardList />} title="No quotes yet" description="Send a quote before the work starts, then convert it to an invoice in one click." action={canWrite ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>New quote</Button> : null} />
            )
          }
        />
      </TableCard>
      <Pagination page={data.p.page} pageSize={data.p.pageSize} total={data.total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
