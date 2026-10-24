import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Download, LayoutGrid, List, Plus, Target, Upload } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { ImportLeadsDialog } from '@/components/orbit/import-leads-dialog'
import { LeadBoard } from '@/components/orbit/lead-board'
import { LeadTable } from '@/components/orbit/lead-table'
import { FilterChip, SegmentLinks } from '@/components/orbit/parts'
import { UrlSelect } from '@/components/orbit/url-select'
import { loadChoices } from '@/modules/orbit/choices'
import { LEAD_STAGES, LEAD_STAGE_LABEL, PAGE_SIZE } from '@/modules/orbit/constants'
import { boardLeads, listLeads, parseLeadQuery } from '@/modules/orbit/leads.queries'
import { peopleIndex } from '@/modules/orbit/people'
import { sequenceOptions } from '@/modules/orbit/sequences/queries'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Leads' }
const BASE = '/app/orbit/leads'

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  const q = parseLeadQuery(sp)
  const { cfg, people, choices } = await loadChoices(ctx)
  const index = peopleIndex(people)
  const today = todayIST()
  const canWrite = ctx.can('leads.write')
  const canClose = ctx.can('orbit.close')
  const filtered = Boolean(q.q || q.sector || q.source || q.due || q.stale || (q.stage !== 'open' && q.view === 'table'))

  const list = q.view === 'table' ? await listLeads(ctx, q, cfg, index) : null
  const board = q.view === 'board' ? await boardLeads(ctx, q, cfg, index) : null
  const count = list ? list.total : (board?.cards.length ?? 0)
  const exportHref = buildHref('/api/orbit/leads/export', sp, { page: undefined, view: undefined })

  // ?import=1 (Settings → Import → Leads) opens the dialog: only the header's copy, so it never opens twice.
  const importButton = (open: boolean) => (canWrite ? <ImportLeadsDialog choices={choices} canAssign={canClose} defaultOpen={open} trigger={<Button variant="secondary" icon={<Upload className="size-4" />}>Import CSV</Button>} /> : null)
  const openImport = first(sp.import) === '1'
  const newButton = canWrite ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>New lead</Button> : null

  return (
    <>
      <PageHeader
        title="Leads"
        help="clients-leads-contacts"
        description={`${count.toLocaleString('en-IN')} ${q.view === 'board' ? 'on the board' : 'records'}. Everyone you are talking to, by stage.`}
        breadcrumb={breadcrumbFor(BASE)}
        icon={<Target />}
        actions={
          <>
            <SearchInput placeholder="Search leads" />
            {importButton(openImport)}
            <Button variant="ghost" icon={<Download className="size-4" />} href={exportHref}>Export</Button>
            {newButton}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SegmentLinks
            label="View"
            items={[
              { href: buildHref(BASE, sp, { view: undefined, page: undefined }), label: 'Table', icon: <List />, active: q.view === 'table' },
              { href: buildHref(BASE, sp, { view: 'board', page: undefined }), label: 'Board', icon: <LayoutGrid />, active: q.view === 'board' },
            ]}
          />
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-white/[0.12] sm:block" />
          {q.view === 'table' ? (
            <UrlSelect param="stage" label="Stage" allValue="open" allLabel="Open leads" options={[{ value: 'all', label: 'All stages' }, { value: 'closed', label: 'Closed' }, ...LEAD_STAGES.map((s) => ({ value: s, label: LEAD_STAGE_LABEL[s] }))]} />
          ) : null}
          <UrlSelect param="sector" label="Sector" allLabel="All sectors" options={cfg.sectors.map((s) => ({ value: s.key, label: s.label }))} />
          <UrlSelect param="source" label="Source" allLabel="All sources" options={cfg.sources.map((s) => ({ value: s.key, label: s.label }))} />
          {ctx.can('orbit.view_all') ? (
            <UrlSelect param="owner" label="Owner" allLabel="Whole team" options={[{ value: 'me', label: 'My leads' }, ...people.filter((p) => p.canWrite).map((p) => ({ value: p.id, label: p.name }))]} />
          ) : null}
          <UrlSelect param="due" label="Next step" allLabel="Any next step" options={[{ value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'week', label: 'Due this week' }, { value: 'none', label: 'No next step' }]} />
          <FilterChip href={buildHref(BASE, sp, { stale: q.stale ? undefined : '1', page: undefined })} active={q.stale} icon={<Clock />}>Stale only</FilterChip>
          {q.view === 'board' ? <FilterChip href={buildHref(BASE, sp, { closed: q.showClosed ? undefined : '1' })} active={q.showClosed}>Show closed</FilterChip> : null}
        </div>
      </PageHeader>

      {list ? (
        list.rows.length === 0 ? (
          <div className="card-table">
            {list.total > 0 ? (
              <EmptyState icon={<Target />} title="No leads on this page" description={`There are ${list.total.toLocaleString('en-IN')} leads; this page is past the end.`} action={<Button variant="secondary" href={buildHref(BASE, sp, { page: undefined })}>Go to page 1</Button>} />
            ) : filtered ? (
              <EmptyState icon={<Target />} title="No leads match these filters" description="Loosen a filter or clear them all." action={<Button variant="secondary" href={BASE}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={<Target />} title="No leads yet" description="Add your first lead or import a CSV of sourced leads." action={<div className="flex flex-wrap justify-center gap-2">{newButton}{importButton(false)}</div>} />
            )}
          </div>
        ) : (
          <>
            <LeadTable rows={list.rows} params={sp} today={today} owners={choices.owners} reviewers={choices.reviewers} reasons={choices.lostReasons} sequences={canWrite ? await sequenceOptions(ctx) : []} canWrite={canWrite} canClose={canClose} />
            <Pagination page={q.page} pageSize={PAGE_SIZE} total={list.total} basePath={BASE} params={sp} />
          </>
        )
      ) : null}
      {board ? (
        <>
          <LeadBoard cards={board.cards} showClosed={q.showClosed} today={today} choices={choices} canClose={canClose} warmSources={choices.sources.filter((s) => s.warm).map((s) => s.key)} truncated={board.truncated} />
          {board.truncated.length ? <p className="mt-2 text-[13px] text-fg-2">Some columns show the first 100 leads. <Link className="text-link transition-colors hover:text-white" href={buildHref(BASE, sp, { view: undefined })}>View all in the table</Link></p> : null}
        </>
      ) : null}
    </>
  )
}
