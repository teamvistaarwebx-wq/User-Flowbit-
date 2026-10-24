import type { Metadata } from 'next'
import { FileSpreadsheet, ListChecks, Paperclip, Plus, Repeat, Wallet } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatMonth, monthOf, shiftMonth, todayIST } from '@/lib/dates'
import { buildHref, first, parseListParams, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { StatCard } from '@/components/ui/stat-card'
import { FilterSelect } from '@/components/folio/FilterSelect'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { PeriodPicker } from '@/components/folio/PeriodPicker'
import { CopyRecurringButton } from '@/components/folio/expenses/ExpenseActions'
import { EMBEDDED_TABLE, TableCard } from '@/components/folio/ui'
import { resolvePeriod } from '@/modules/folio/engine/period'
import { listExpenses, recurringToCopy, type ExpenseRow } from '@/modules/folio/expenses/queries'
import { EXPENSE_MODE_LABELS, type ExpenseMode } from '@/modules/folio/expenses/rules'
import { firmContext } from '@/modules/folio/queries/common'
import { PAGE_SIZE } from '@/modules/folio/types'

export const metadata: Metadata = { title: 'Expenses' }

const BASE = '/app/folio/expenses'

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'expenses.read' })
  const today = todayIST()
  const p = parseListParams(sp, { pageSize: PAGE_SIZE })
  const period = resolvePeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }, today, 'this_fy')
  const canWrite = ctx.can('expenses.write')
  const month = monthOf(today)
  const { firms, firm } = await firmContext(ctx, first(sp.firm))
  const filters = { entityId: firm?.id ?? null, period, categoryId: p.get('category') ?? null, q: p.q || null }
  const [data, toCopy] = await Promise.all([listExpenses(ctx, filters, { skip: p.skip, limit: p.pageSize }), canWrite ? recurringToCopy(ctx, month, firm?.id ?? null) : Promise.resolve([])])
  const filtered = Boolean(p.q || p.get('category'))
  const newHref = firm ? `${BASE}/new?firm=${firm.code}` : `${BASE}/new`
  const csvHref = buildHref('/api/folio/expenses/csv', {}, { firm: firm?.code, period: period.key, from: period.key === 'custom' ? period.from : undefined, to: period.key === 'custom' ? period.to : undefined, category: p.get('category'), q: p.q || undefined })
  const where = firm ? ` by ${firm.name}` : ''

  const columns: Column<ExpenseRow>[] = [
    { key: 'date', header: 'Paid on', className: 'whitespace-nowrap', cell: (r) => <span className="text-[#979797]">{formatDate(r.date)}</span> },
    {
      key: 'vendor',
      header: 'Paid to',
      className: 'min-w-[180px]',
      cell: (r) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-1.5 font-medium text-fg">
            {r.vendor}
            {r.repeatMonthly ? <Repeat className="size-3.5 text-fg-3" aria-label="Repeats monthly" /> : null}
            {r.hasReceipt ? <Paperclip className="size-3.5 text-fg-3" aria-label="Bill attached" /> : null}
          </span>
          {r.description ? <span className="block max-w-[260px] truncate text-xs text-fg-2">{r.description}</span> : null}
        </span>
      ),
    },
    { key: 'category', header: 'Category', cell: (r) => <Badge tone="neutral">{r.categoryName}</Badge> },
    ...(firms.length > 1 && !firm ? [{ key: 'firm', header: 'Firm', hideOnMobile: true, cell: (r: ExpenseRow) => r.entityCode }] : []),
    { key: 'mode', header: 'Paid by', hideOnMobile: true, className: 'whitespace-nowrap', cell: (r) => `${EXPENSE_MODE_LABELS[r.mode as ExpenseMode] ?? r.mode}${r.paidFrom === 'cash' ? ' · cash' : ''}` },
    { key: 'gst', header: 'GST', align: 'right', hideOnMobile: true, className: 'whitespace-nowrap', cell: (r) => (r.gstPaise ? <span className="tabular-nums text-fg-2">{formatINR(r.gstPaise)}{r.inputTaxPaise ? '' : <span className="ml-1 text-xs text-fg-3">(cost)</span>}</span> : <span className="text-fg-3">—</span>) },
    { key: 'amount', header: 'Amount', align: 'right', className: 'whitespace-nowrap', cell: (r) => <span className="tabular-nums text-fg">{formatINR(r.amountPaise)}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Expenses"
        help="claims-vs-expenses"
        icon={<Wallet />}
        description={`What the business paid out${where}, ${period.key === 'all' ? 'on every date' : `${period.noun} (${period.window})`}.`}
        actions={
          <>
            <a className={buttonClass('ghost')} href={csvHref}><FileSpreadsheet className="size-4" /> Export CSV</a>
            {toCopy.length ? <CopyRecurringButton month={month} entityId={firm?.id ?? null} count={toCopy.length} fromLabel={formatMonth(shiftMonth(month, -1)).split(' ')[0]} /> : null}
            {canWrite ? <Button variant="primary" icon={<Plus className="size-4" />} href={newHref}>Book expense</Button> : null}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <FirmSwitch base={BASE} params={sp} firms={firms} firm={firm} />
          <PeriodPicker base={BASE} params={sp} period={period} today={today} allowAll />
        </div>
      </PageHeader>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={`Paid ${period.noun}`} value={formatINRCompact(data.amountPaise)} hint={`${formatINR(data.amountPaise, { decimals: 0 })} across ${data.total} ${data.total === 1 ? 'expense' : 'expenses'} · ${period.window}`} color="var(--violet)" />
        <StatCard label="Input tax to claim" value={formatINRCompact(data.inputTaxPaise)} hint="GST on bills marked claimable. Match it with GSTR-2B before claiming." color="var(--info)" />
        <StatCard label="Cost in the P&L" value={formatINRCompact(data.netPaise)} hint="Amount paid less claimable GST" color="var(--orange)" href={ctx.can('folio.reports') ? buildHref('/app/folio/pnl', {}, { firm: firm?.code, period: period.key === 'all' ? undefined : period.key, from: period.key === 'custom' ? period.from : undefined, to: period.key === 'custom' ? period.to : undefined }) : undefined} />
      </div>

      <TableCard icon={<ListChecks />} title="Expenses" subtitle={`Showing ${data.total} ${data.total === 1 ? 'expense' : 'expenses'}`}>
        <div className="flex flex-wrap items-center gap-2 px-[23px] pb-4">
          <SearchInput placeholder="Vendor, description or reference" className="w-full sm:w-72" />
          <FilterSelect param="category" placeholder="Every category" options={data.categories.map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (archived)` }))} />
        </div>
        <DataTable
          className={EMBEDDED_TABLE}
          columns={columns}
          rows={data.rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `${BASE}/${r.id}`}
          basePath={BASE}
          params={sp}
          empty={
            filtered ? (
              <EmptyState compact icon={<Wallet />} title="No expenses match these filters." action={<Button variant="secondary" href={buildHref(BASE, sp, { q: undefined, category: undefined, page: undefined })}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={<Wallet />} title={`Nothing booked ${period.key === 'all' ? 'yet' : period.noun}`} description="Book rent, software, travel and vendor payments as they go out, so the profit and loss view tells the truth." action={canWrite ? <Button variant="primary" icon={<Plus className="size-4" />} href={newHref}>Book expense</Button> : null} />
            )
          }
        />
      </TableCard>
      <Pagination page={p.page} pageSize={p.pageSize} total={data.total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
