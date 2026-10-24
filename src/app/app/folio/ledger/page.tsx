import type { Metadata } from 'next'
import { BookOpen, ListChecks } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { buildHref, parseListParams, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { EMBEDDED_TABLE, TableCard } from '@/components/folio/ui'
import { ledgerIndex, type LedgerIndexRow } from '@/modules/folio/queries/ledger-index'
import { PAGE_SIZE } from '@/modules/folio/types'
import { FilterTabs } from '../receipts/_components/filter-tabs'

export const metadata: Metadata = { title: 'Ledgers' }

const BASE = '/app/folio/ledger'

export default async function LedgerIndexPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const p = parseListParams(sp, { pageSize: PAGE_SIZE })
  const overdueOnly = p.get('overdue') === '1'
  const all = await ledgerIndex(ctx, { q: p.q, overdueOnly })
  const rows = all.slice(p.skip, p.skip + p.pageSize)
  const overdueClients = all.filter((r) => r.overduePaise > 0).length
  const totals = all.reduce((t, r) => ({ outstanding: t.outstanding + r.outstandingPaise, overdue: t.overdue + r.overduePaise, net: t.net + r.netReceivablePaise }), { outstanding: 0, overdue: 0, net: 0 })

  const columns: Column<LedgerIndexRow>[] = [
    { key: 'client', header: 'Client', cell: (r) => r.clientName },
    { key: 'terms', header: 'Terms', hideOnMobile: true, cell: (r) => (r.termsDays === null ? <span className="text-fg-2">Firm default</span> : <span className="text-white/75">{r.termsDays} days</span>) },
    { key: 'lastBilled', header: 'Last billed', hideOnMobile: true, cell: (r) => <span className="text-[#979797]">{formatDate(r.lastBilled)}</span> },
    { key: 'overdue', header: 'Overdue', align: 'right', cell: (r) => (r.overduePaise > 0 ? <span className="tabular-nums text-[#FF6A66]">{formatINR(r.overduePaise)}</span> : <span className="text-fg-3">—</span>) },
    { key: 'outstanding', header: 'Outstanding', align: 'right', cell: (r) => <span className="tabular-nums">{formatINR(r.outstandingPaise)}</span> },
    { key: 'credit', header: 'Unapplied credit', align: 'right', hideOnMobile: true, cell: (r) => (r.unappliedCreditPaise > 0 ? <span className="tabular-nums text-[#2DCBAF]">{formatINR(r.unappliedCreditPaise)}</span> : <span className="text-fg-3">—</span>) },
    { key: 'net', header: 'Net receivable', align: 'right', cell: (r) => <span className="font-medium tabular-nums text-fg">{formatINR(r.netReceivablePaise)}</span> },
  ]

  return (
    <>
      <PageHeader title="Ledgers" description={`${formatINR(totals.net)} net receivable · ${formatINR(totals.overdue)} overdue across ${overdueClients} ${overdueClients === 1 ? 'client' : 'clients'}.`} icon={<BookOpen />} />
      <TableCard
        icon={<ListChecks />}
        title="Client balances"
        subtitle={`${formatINR(totals.outstanding)} outstanding on open invoices`}
        actions={<FilterTabs label="Ledger filter" tabs={[{ href: buildHref(BASE, sp, { overdue: undefined, page: undefined }), label: 'All clients', active: !overdueOnly }, { href: buildHref(BASE, sp, { overdue: '1', page: undefined }), label: 'Overdue only', active: overdueOnly }]} />}
      >
        <div className="px-[23px] pb-4">
          <SearchInput placeholder="Search clients" />
        </div>
        <DataTable
          className={EMBEDDED_TABLE}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.clientId}
          rowHref={(r) => `${BASE}/${r.clientId}`}
          params={sp}
          empty={
            p.q || overdueOnly ? (
              <EmptyState icon={<BookOpen />} title={overdueOnly ? 'Nobody is overdue' : `No clients match "${p.q}"`} action={<Button size="sm" variant="secondary" href={BASE}>Clear filters</Button>} compact />
            ) : (
              <EmptyState icon={<BookOpen />} title="No balances yet" description="Ledgers appear once a client has an issued invoice or a payment." compact />
            )
          }
        />
      </TableCard>
      <Pagination page={p.page} pageSize={p.pageSize} total={all.length} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
