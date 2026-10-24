import type { Metadata } from 'next'
import Link from 'next/link'
import { FileMinus, ListChecks, Plus } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { FilterTabs } from '@/components/folio/FilterTabs'
import { FolioStatus } from '@/components/folio/StatusBadge'
import { EMBEDDED_TABLE, LINK, TableCard } from '@/components/folio/ui'
import { listCreditNotes, type CreditNoteRow } from '@/modules/folio/credit-notes/queries'
import { CREDIT_NOTE_REASON_LABELS } from '@/modules/folio/types'

export const metadata: Metadata = { title: 'Credit notes' }

const BASE = '/app/folio/credit-notes'

export default async function CreditNotesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const data = await listCreditNotes(ctx, sp)
  const canWrite = ctx.can('credit_notes.write')
  const filtered = ['q', 'status', 'client', 'from', 'to'].some((k) => sp[k])
  const status = first(sp.status)
  const columns: Column<CreditNoteRow>[] = [
    { key: 'number', header: 'Number', cell: (r) => <span className="font-medium text-fg">{r.number}</span> },
    { key: 'client', header: 'Client', cell: (r) => <Link href={`/app/clients/${r.clientId}`} className="text-white/85 transition-colors hover:text-blush">{r.clientName}</Link> },
    { key: 'invoice', header: 'Against', cell: (r) => <Link href={`/app/folio/invoices/${r.invoiceId}`} className={LINK}>{r.invoiceNumber}</Link> },
    { key: 'noteDate', header: 'Date', hideOnMobile: true, cell: (r) => <span className="text-[#979797]">{formatDate(r.noteDate)}</span> },
    { key: 'reason', header: 'Reason', hideOnMobile: true, cell: (r) => <span className="block max-w-[220px] truncate" title={r.reasonText}>{CREDIT_NOTE_REASON_LABELS[r.reason]}</span> },
    { key: 'status', header: 'Status', cell: (r) => <FolioStatus status={r.status} /> },
    { key: 'total', header: 'Total', align: 'right', cell: (r) => <span className="tabular-nums text-fg">{formatINR(r.totalPaise)}</span> },
  ]
  const pick = canWrite ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>Pick an invoice</Button> : null
  return (
    <>
      <PageHeader title="Credit notes" icon={<FileMinus />} breadcrumb={breadcrumbFor(BASE)} description="The only way to reduce an issued invoice." actions={pick} />
      <TableCard
        icon={<ListChecks />}
        title="All credit notes"
        subtitle={`Showing ${data.total} ${data.total === 1 ? 'credit note' : 'credit notes'}`}
        actions={<FilterTabs label="Credit note status" tabs={[{ href: BASE, label: 'All', active: !status }, { href: buildHref(BASE, {}, { status: 'issued' }), label: 'Issued', active: status === 'issued' }, { href: buildHref(BASE, {}, { status: 'cancelled' }), label: 'Cancelled', active: status === 'cancelled' }]} />}
      >
        <div className="px-[23px] pb-4">
          <SearchInput placeholder="Number, invoice, reason or client" className="w-full sm:w-80" />
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
              <EmptyState compact icon={<FileMinus />} title="No credit notes match these filters." description="Try another status, or clear the filters." action={<Button variant="secondary" href={BASE}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={<FileMinus />} title="No credit notes" description="A credit note is the only way to reduce an issued invoice: raise one from the invoice." action={pick} />
            )
          }
        />
      </TableCard>
      <Pagination page={data.p.page} pageSize={data.p.pageSize} total={data.total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
