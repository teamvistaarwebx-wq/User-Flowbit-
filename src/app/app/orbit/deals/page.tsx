import type { Metadata } from 'next'
import Link from 'next/link'
import { Handshake, LayoutGrid, List, Plus } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { buildHref, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { StatCard } from '@/components/ui/stat-card'
import { DealBoard } from '@/components/orbit/deal-board'
import { DealFormDialog } from '@/components/orbit/deal-form-dialog'
import { NextStepCell } from '@/components/orbit/lead-table'
import { SegmentLinks } from '@/components/orbit/parts'
import { DealStageBadge } from '@/components/orbit/stage-badge'
import { UrlSelect } from '@/components/orbit/url-select'
import { loadChoices } from '@/modules/orbit/choices'
import { PAGE_SIZE } from '@/modules/orbit/constants'
import { dealStageLabel } from '@/modules/orbit/dealStage'
import { boardDeals, dealTotals, listDeals, parseDealQuery } from '@/modules/orbit/deals.queries'
import { weighted } from '@/modules/orbit/metrics'
import { peopleIndex } from '@/modules/orbit/people'
import type { DealCardData } from '@/modules/orbit/record-types'

export const metadata: Metadata = { title: 'Deals' }
const BASE = '/app/orbit/deals'

export default async function DealsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  const q = parseDealQuery(sp)
  const { people, choices } = await loadChoices(ctx)
  const index = peopleIndex(people)
  const today = todayIST()
  const [totals, board, list] = await Promise.all([
    dealTotals(ctx, q),
    q.view === 'board' ? boardDeals(ctx, q, index) : null,
    q.view === 'table' ? listDeals(ctx, q, index) : null,
  ])
  const colorOf = (stage: string) => choices.dealStages.find((s) => s.key === stage)?.color ?? 'var(--orbit)'
  const newDeal = ctx.can('deals.write') ? (
    <DealFormDialog choices={choices} canAssign={ctx.can('orbit.close')} canCreateClient={ctx.can('clients.write')} today={today} trigger={<Button variant="primary" icon={<Plus className="size-4" />}>New deal</Button>} />
  ) : null
  const empty = (
    <EmptyState
      icon={<Handshake />}
      title={q.q || q.client || q.source || q.close ? 'No deals match these filters' : 'No deals yet'}
      description={q.q || q.client || q.source || q.close ? 'Loosen a filter or clear the search.' : 'Convert a lead at Meeting done, or create a deal for an existing client.'}
      action={<div className="flex flex-wrap justify-center gap-2">{newDeal}<Button variant="secondary" href="/app/orbit/leads">Go to leads</Button></div>}
    />
  )

  const columns: Column<DealCardData>[] = [
    {
      key: 'title', header: 'Deal', sortable: true, className: 'min-w-56',
      cell: (d) => (
        <span className="block">
          <Link href={`${BASE}/${d.id}`} className="text-sm text-white transition-colors hover:text-blush">{d.title}</Link>
          <span className="block truncate text-xs text-[#979797]">{d.clientName}</span>
        </span>
      ),
    },
    {
      key: 'stage', header: 'Stage', className: 'whitespace-nowrap',
      cell: (d) => (
        <span className="block">
          <DealStageBadge label={dealStageLabel(choices.dealStages, d.columnId)} color={colorOf(d.columnId)} status={d.status} />
          {d.status === 'open' ? <span className="mt-1 block text-xs text-[#979797]">{d.daysInStage}d in stage</span> : null}
        </span>
      ),
    },
    { key: 'value', header: 'Value', sortable: true, align: 'right', cell: (d) => <span className="tabular-nums">{formatINR(d.valuePaise, { decimals: 0 })}</span> },
    { key: 'probability', header: 'Prob.', align: 'right', hideOnMobile: true, cell: (d) => <span className="tabular-nums text-[#979797]">{d.probability}%</span> },
    { key: 'weighted', header: 'Weighted', align: 'right', hideOnMobile: true, cell: (d) => <span className="tabular-nums">{formatINRCompact(weighted(d.valuePaise, d.probability))}</span> },
    { key: 'close', header: 'Close by', sortable: true, hideOnMobile: true, cell: (d) => <span className={cn('text-[#979797]', d.status === 'open' && d.expectedCloseDate && d.expectedCloseDate < today && 'text-[#FF2D31]')}>{formatDate(d.expectedCloseDate)}</span>, className: 'whitespace-nowrap' },
    { key: 'owner', header: 'Owner', hideOnMobile: true, className: 'whitespace-nowrap', cell: (d) => d.ownerName },
    { key: 'next', header: 'Next step', hideOnMobile: true, className: 'max-w-44', cell: (d) => (d.status === 'open' ? <NextStepCell title={d.nextTitle} due={d.nextDue} today={today} /> : '—') },
  ]

  return (
    <>
      <PageHeader title="Deals" description="Money in the pipeline, by stage." breadcrumb={breadcrumbFor(BASE)} icon={<Handshake />} actions={<><SearchInput placeholder="Deal or client" />{newDeal}</>}>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentLinks
            label="View"
            items={[
              { href: buildHref(BASE, sp, { view: undefined, page: undefined, status: undefined }), label: 'Board', icon: <LayoutGrid />, active: q.view === 'board' },
              { href: buildHref(BASE, sp, { view: 'table', page: undefined }), label: 'Table', icon: <List />, active: q.view === 'table' },
            ]}
          />
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-white/[0.12] sm:block" />
          {q.view === 'table' ? <UrlSelect param="status" label="Status" allValue="open" allLabel="Open" options={[{ value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }, { value: 'all', label: 'All' }]} /> : null}
          {ctx.can('orbit.view_all') ? <UrlSelect param="owner" label="Owner" allLabel="Whole team" options={[{ value: 'me', label: 'My deals' }, ...people.filter((p) => p.canWrite).map((p) => ({ value: p.id, label: p.name }))]} /> : null}
          <UrlSelect param="source" label="Source" allLabel="All sources" options={choices.sources.map((s) => ({ value: s.key, label: s.label }))} />
          <UrlSelect param="close" label="Expected close" allLabel="Any close date" options={[{ value: 'this_month', label: 'Closing this month' }, { value: 'next_30', label: 'Next 30 days' }, { value: 'overdue', label: 'Past close date' }]} />
        </div>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open pipeline" value={formatINRCompact(totals.openPaise)} color="var(--info)" hint="Every open deal at full value" />
        <StatCard label="Weighted" value={formatINRCompact(totals.weightedPaise)} color="#8E8DFF" hint="Value × stage probability" />
        <StatCard label="Won this month" value={formatINRCompact(totals.wonPaise)} color="var(--success)" hint={`${totals.wonCount} ${totals.wonCount === 1 ? 'deal' : 'deals'}`} />
        <StatCard label="Expected this month" value={formatINRCompact(totals.expectedPaise)} color="var(--orange)" hint="Open deals closing this month" />
      </div>

      {board ? (
        board.length === 0 ? <div className="card-table">{empty}</div> : (
          <>
            <DealBoard deals={board} choices={choices} canClose={ctx.can('orbit.close')} today={today} />
            <p className="mt-2 text-[13px] text-fg-2">Won and Lost show the last 90 days. <Link className="text-link transition-colors hover:text-white" href={buildHref(BASE, sp, { view: 'table', status: 'all' })}>Show older in the table</Link></p>
          </>
        )
      ) : null}
      {list ? (
        <>
          <DataTable columns={columns} rows={list.rows} rowKey={(d) => d.id} basePath={BASE} params={sp} empty={empty} />
          <Pagination page={q.page} pageSize={PAGE_SIZE} total={list.total} basePath={BASE} params={sp} />
        </>
      ) : null}
    </>
  )
}
