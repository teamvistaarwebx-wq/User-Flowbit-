import type { Metadata } from 'next'
import { Building2, Download, LayoutGrid, List, Plus, Upload } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { CLIENT_STATUS_PLURAL } from '@/lib/client-status'
import { importHref } from '@/modules/imports/entry'
import { requireMember } from '@/lib/ctx'
import { formatMonth, todayIST } from '@/lib/dates'
import { buildHref, type SearchParams } from '@/lib/list'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { ClientCards } from '@/components/clients/client-cards'
import { clientTableColumns } from '@/components/clients/client-table'
import { ClientsDashboard } from '@/components/clients/clients-dashboard'
import { SegmentLinks } from '@/components/folio/ui'
import { UrlSelect } from '@/components/orbit/url-select'
import { clientDashboard } from '@/modules/clients/dashboard'
import { lastMonths, TREND_MONTHS } from '@/modules/clients/dashboard-math'
import { CLIENT_HEALTH, HEALTH_LABEL } from '@/modules/clients/health'
import { CLIENT_PAGE_SIZE, clientColumns, clientTags, listClients, parseClientQuery } from '@/modules/clients/queries'
import { allSignalsOnce, healthOf, lastTouch } from '@/modules/clients/signals'
import type { ClientCardRow } from '@/modules/clients/view-model'
import { nameOf, orbitPeople, peopleIndex } from '@/modules/orbit/people'
import { fileUrl } from '@/lib/files'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { IMPORTERS } from '@/modules/imports/registry'

export const metadata: Metadata = { title: 'Clients' }
/** Contacts and companies (Orbit), then Folio clients. */
const CLIENT_IMPORTERS = ['contacts', 'folio_clients'] as const

const BASE = '/app/clients'

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ anyProduct: ['work', 'orbit', 'folio'], perm: 'clients.read' })
  const q = parseClientQuery(sp)
  const today = todayIST()
  // One workspace-wide signals query for both the health filter and the dashboard (R2 16.3).
  const allSignals = allSignalsOnce(ctx, today)
  const [data, people, tags, dashboard] = await Promise.all([listClients(ctx, q, today, allSignals), orbitPeople(ctx), clientTags(ctx), clientDashboard(ctx, today, allSignals)])
  const index = peopleIndex(people)
  const cols = clientColumns(ctx)
  const filtered = Boolean(q.q || q.owner || q.tag || q.health || q.isNew || q.cohort || q.status !== 'current')
  // The existing importers that create clients (Settings → Import), when the product and permission allow them.
  const importers = CLIENT_IMPORTERS.filter((k) => { const imp = IMPORTERS[k]; return (!imp.product || ctx.has(imp.product)) && ctx.can(imp.perm) })
  const clientImportHref = (k: (typeof CLIENT_IMPORTERS)[number]) => importHref(k, 'clients')
  const importButton = importers.length === 1 ? (
    <Button variant="ghost" icon={<Upload className="size-4" />} href={clientImportHref(importers[0])}>Import</Button>
  ) : importers.length > 1 ? (
    <DropdownMenu trigger={<Button variant="ghost" icon={<Upload className="size-4" />}>Import</Button>} items={importers.map((k) => ({ label: IMPORTERS[k].label, href: clientImportHref(k) }))} />
  ) : null
  const add = ctx.can('clients.write') ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>Add client</Button> : null

  const flags = { work: cols.work, folio: cols.folio, orbit: cols.orbit, margin: Boolean(data.cards.margin) }
  const rows: ClientCardRow[] = data.rows.map((c) => {
    const id = String(c._id)
    const signal = data.signals.get(id)
    const primary = c.contacts.find((x) => x.primary) ?? c.contacts[0]
    return {
      id,
      name: c.name,
      displayName: c.displayName ?? null,
      kind: c.kind,
      logoUrl: c.logoFileId ? fileUrl(c.logoFileId) : null,
      status: c.status,
      ownerName: c.ownerId ? nameOf(index, c.ownerId) : null,
      primaryContact: primary ? { name: primary.name, phone: primary.phone ?? null } : null,
      health: healthOf(c, signal, today),
      minutesThisMonth: cols.work ? (data.cards.minutesThisMonth.get(id) ?? 0) : null,
      retainerHours: data.cards.retainerHours.get(id) ?? null,
      margin: data.cards.margin?.get(id),
      overduePaise: cols.folio ? (signal?.overduePaise ?? 0) : null,
      outstandingPaise: cols.folio ? (data.metrics.outstanding.get(id) ?? 0) : null,
      pipelinePaise: cols.orbit ? (data.metrics.pipeline.get(id) ?? 0) : null,
      projects: cols.work ? (data.metrics.projects.get(id) ?? 0) : null,
      lastActivityAt: lastTouch(signal, c.updatedAt),
      onboardedAt: c.createdAt ?? null,
    }
  })
  const columns = clientTableColumns(flags)
  const sortOptions = [{ value: 'recent', label: 'Recently updated' }, { value: 'onboarded', label: 'Newest first' }, ...(cols.orbit ? [{ value: 'pipeline', label: 'Open pipeline' }] : []), ...(cols.folio ? [{ value: 'outstanding', label: 'Outstanding' }] : [])]
  const cohorts = lastMonths(today, TREND_MONTHS).reverse().map((m) => ({ value: m, label: formatMonth(m) }))
  const viewHref = (view: 'cards' | 'list') => buildHref(BASE, sp, { view: view === 'cards' ? undefined : view, page: undefined })
  const empty =
    data.total > 0 ? (
      <EmptyState icon={<Building2 />} title="No clients on this page" description="This page is past the end of the list." action={<Button variant="secondary" href={buildHref(BASE, sp, { page: undefined })}>Go to page 1</Button>} compact />
    ) : filtered ? (
      <EmptyState icon={<Building2 />} title="No clients match these filters" description="Loosen a filter or clear them all." action={<Button variant="secondary" href={BASE}>Clear filters</Button>} compact />
    ) : (
      <EmptyState icon={<Building2 />} title="No clients yet" description="Add your first client, or convert a lead in Orbit." action={add} compact />
    )

  return (
    <>
      <PageHeader
        title="Clients"
        help="clients-leads-contacts"
        description="Every company and person you work for or bill, shared by Work, Orbit and Folio. A prospect is a client you have not won yet."
        breadcrumb={breadcrumbFor(BASE)}
        icon={<Building2 />}
        actions={<><SearchInput placeholder="Search clients" />{ctx.can('clients.write') ? <Button variant="ghost" icon={<Download className="size-4" />} href={buildHref('/api/orbit/clients/export', sp, { page: undefined })}>Export</Button> : null}{importButton}{add}</>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <UrlSelect param="status" label="Status" allValue="current" allLabel="Active and prospects" options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'lead', label: CLIENT_STATUS_PLURAL.lead }, { value: 'inactive', label: 'Inactive' }]} />
          <UrlSelect param="owner" label="Owner" allLabel="Any owner" options={people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))} />
          {tags.length ? <UrlSelect param="tag" label="Tag" allLabel="Any tag" options={tags.map((t) => ({ value: t, label: t }))} /> : null}
          <UrlSelect param="health" label="Health" allLabel="Any health" options={CLIENT_HEALTH.map((h) => ({ value: h, label: HEALTH_LABEL[h] }))} />
          <UrlSelect param="new" label="New" allLabel="Any time" options={[{ value: '30', label: 'New in 30 days' }, { value: '90', label: 'New in 90 days' }]} />
          <UrlSelect param="cohort" label="Onboarded" allLabel="Any month" options={cohorts} />
          <UrlSelect param="sort" label="Sort" allValue="name" allLabel="Name A–Z" options={sortOptions} />
          <SegmentLinks label="View" className="ml-auto" items={[{ href: viewHref('cards'), label: 'Cards', icon: <LayoutGrid />, active: q.view === 'cards' }, { href: viewHref('list'), label: 'List', icon: <List />, active: q.view === 'list' }]} />
        </div>
      </PageHeader>
      <ClientsDashboard data={dashboard} base={BASE} />
      {q.view === 'list' ? <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} empty={empty} /> : <ClientCards rows={rows} flags={flags} empty={empty} />}
      <Pagination page={q.page} pageSize={CLIENT_PAGE_SIZE} total={data.total} basePath={BASE} params={sp} />
    </>
  )
}
