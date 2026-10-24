import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, ListChecks, Plus } from 'lucide-react'
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
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { PeriodPicker } from '@/components/folio/PeriodPicker'
import { GenerateDraftsButton } from '@/components/folio/GenerateDraftsButton'
import { SetupCallout } from '@/components/folio/SetupCallout'
import { EMBEDDED_TABLE, TableCard } from '@/components/folio/ui'
import { DocTypeBadge, InvoiceStatusBadge, WrittenOffBadge } from '@/components/folio/StatusBadge'
import { AGING_LABELS, type AgingBucket } from '@/modules/folio/engine/aging'
import { resolvePeriod } from '@/modules/folio/engine/period'
import { daysOverdue, listInvoices, type InvoiceListRow } from '@/modules/folio/invoices/queries'
import { firmContext } from '@/modules/folio/queries/common'
import { retainersDue } from '@/modules/folio/recurring/queries'
import { hasAnyEntity } from '@/modules/folio/settings/queries'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Invoices' }

const BASE = '/app/folio/invoices'
const FILTER_KEYS = ['q', 'status', 'type', 'entity', 'client', 'open', 'overdue', 'aging']
const STATUS_KEYS = ['status', 'open', 'overdue', 'aging']

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const today = todayIST()
  const period = resolvePeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }, today, 'all')
  const { firms, firm } = await firmContext(ctx, first(sp.firm))
  // The firm filter and the period feed the existing entity/from/to filters of the list query.
  const query: SearchParams = { ...sp, entity: firm?.id ?? first(sp.entity), from: period.from ?? undefined, to: period.to ?? undefined }
  const [data, due, ready] = await Promise.all([listInvoices(ctx, query), ctx.can('invoices.write') ? retainersDue(ctx) : null, hasAnyEntity(ctx)])
  const filtered = FILTER_KEYS.some((k) => sp[k]) || period.key !== 'all'
  const agingKey = first(sp.aging) as AgingBucket | undefined
  const agingLabel = agingKey && agingKey in AGING_LABELS ? AGING_LABELS[agingKey] : null
  const columns: Column<InvoiceListRow>[] = [
    {
      key: 'number',
      header: 'Invoice',
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <DocTypeBadge documentType={r.documentType} />
          <span className="min-w-0">
            <span className="block font-medium text-fg">{r.number ?? 'Draft'}</span>
            {r.subject ? <span className="block max-w-[220px] truncate text-xs text-fg-2">{r.subject}</span> : null}
          </span>
        </span>
      ),
    },
    // Client names wrap to two lines at most so the date and amount columns keep their width.
    { key: 'client', header: 'Client', className: 'min-w-[160px] max-w-[240px]', cell: (r) => <Link href={`/app/clients/${r.clientId}`} title={r.clientName} className="line-clamp-2 break-words text-white/85 transition-colors hover:text-blush">{r.clientName}</Link> },
    ...(data.multiEntity && !firm ? [{ key: 'entity', header: 'Firm', hideOnMobile: true, cell: (r: InvoiceListRow) => r.entityCode }] : []),
    { key: 'issueDate', header: 'Date', hideOnMobile: true, className: 'whitespace-nowrap', cell: (r) => <span className="text-[#979797]">{formatDate(r.issueDate)}</span> },
    { key: 'dueDate', header: 'Due', hideOnMobile: true, className: 'whitespace-nowrap', cell: (r) => <span className={daysOverdue(r) > 0 ? 'text-[#FF2D31]' : 'text-[#979797]'}>{formatDate(r.dueDate)}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          <InvoiceStatusBadge status={r.status} daysOverdue={daysOverdue(r)} />
          {r.writtenOffPaise > 0 ? <WrittenOffBadge /> : null}
        </span>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', className: 'whitespace-nowrap', cell: (r) => <span className="tabular-nums text-fg">{formatINR(r.totalPaise)}</span> },
    { key: 'balance', header: 'Balance', align: 'right', className: 'whitespace-nowrap', cell: (r) => (r.balancePaise > 0 ? <span className="tabular-nums text-white">{formatINR(r.balancePaise)}</span> : <span className="text-fg-3">—</span>) },
  ]
  const reset = Object.fromEntries([...STATUS_KEYS, 'page'].map((k) => [k, undefined]))
  const tab = (label: string, patch: Record<string, string>) => ({ label, href: buildHref(BASE, sp, { ...reset, ...patch }), active: STATUS_KEYS.every((k) => (first(sp[k]) ?? '') === (patch[k] ?? '')) })
  // A custom range's noun and window are the same words: print them once.
  const span = period.key === 'all' ? '' : period.noun === period.window ? ` ${period.noun}` : ` ${period.noun} (${period.window})`
  return (
    <>
      <PageHeader
        title="Invoices"
        help="folio-documents"
        icon={<FileText />}
        breadcrumb={breadcrumbFor(BASE)}
        description={`${formatINR(data.billedPaise, { decimals: 0 })} billed${span} · ${formatINR(data.owedPaise, { decimals: 0 })} of it still owed today`}
        actions={
          <>
            {due && due.drafts > 0 ? <GenerateDraftsButton count={due.drafts} label={`Generate retainer drafts (${due.drafts} due)`} /> : null}
            {ctx.can('invoices.write') && ready ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>New invoice</Button> : null}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <FirmSwitch base={BASE} params={sp} firms={firms} firm={firm} clear={['entity']} />
          <PeriodPicker base={BASE} params={sp} period={period} today={today} allowAll />
        </div>
      </PageHeader>
      {!ready ? <SetupCallout canSetUp={ctx.can('folio.settings')} /> : null}
      <TableCard
        icon={<ListChecks />}
        title="All invoices"
        subtitle={`Showing ${data.total} ${data.total === 1 ? 'invoice' : 'invoices'}${span ? ` issued${span}` : ''}${agingLabel ? ` · open, ${agingLabel.toLowerCase()}` : ''}`}
        actions={
          <FilterTabs
            label="Invoice status"
            tabs={[tab('All', {}), tab('Drafts', { status: 'draft' }), tab('Open', { open: '1' }), tab('Overdue', { overdue: '1' }), tab('Paid', { status: 'paid' }), tab('Void', { status: 'void' }), tab('Written off', { status: 'written_off' })]}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-[23px] pb-4">
          <SearchInput placeholder="Number, subject, PO or client" className="w-full sm:w-72" />
          <FilterSelect param="type" placeholder="Any document" options={[{ value: 'tax_invoice', label: 'Tax invoices' }, { value: 'sale_invoice', label: 'Sale invoices' }]} />
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
              <EmptyState compact icon={<FileText />} title="No invoices match these filters." description="Try another status or period, or clear them." action={<Button variant="secondary" href={buildHref(BASE, {}, { firm: firm?.code })}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={<FileText />} title="No invoices yet" description="Raise the first one: pick the business, the client and what you're billing." action={ctx.can('invoices.write') && ready ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>New invoice</Button> : null} />
            )
          }
        />
      </TableCard>
      <Pagination page={data.p.page} pageSize={data.p.pageSize} total={data.total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
