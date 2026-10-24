import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Contact, Star, UserPlus } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { ClientStatusPill } from '@/components/clients/client-status-pill'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { LinkTabs } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { ContactDialog } from '@/components/clients/contact-dialog'
import { FilterChip } from '@/components/orbit/parts'
import { LeadStageBadge } from '@/components/orbit/stage-badge'
import { UrlSelect } from '@/components/orbit/url-select'
import { PAGE_SIZE, type LeadStage } from '@/modules/orbit/constants'
import { listClientContacts, listProspects, type ContactRow } from '@/modules/orbit/contacts.queries'
import { nameOf, orbitPeople, peopleIndex } from '@/modules/orbit/people'

export const metadata: Metadata = { title: 'Contacts' }
const BASE = '/app/orbit/contacts'

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  if (!ctx.can('clients.read')) redirect('/app/denied')
  const tab = first(sp.tab) === 'prospects' ? 'prospects' : 'clients'
  const q = (first(sp.q) ?? '').trim().slice(0, 80)
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1)
  const primaryOnly = first(sp.primary) === '1'
  const status = ['lead', 'active', 'inactive'].includes(first(sp.status) ?? '') ? (first(sp.status) as string) : null
  const canAdd = ctx.canAny('clients.write', 'contacts.write')
  const addButton = canAdd ? <ContactDialog goToContact trigger={<Button variant="primary" icon={<UserPlus className="size-4" />}>Add contact</Button>} /> : null

  const clientsData = tab === 'clients' ? await listClientContacts(ctx, { q, status, primaryOnly, page }) : null
  const prospectsData = tab === 'prospects' ? await listProspects(ctx, { q, page }) : null
  const index = prospectsData ? peopleIndex(await orbitPeople(ctx)) : null

  const columns: Column<ContactRow>[] = [
    { key: 'name', header: 'Name', cell: (c) => <span className="inline-flex items-center gap-2"><Link href={`${BASE}/${c.id}`} className="whitespace-nowrap text-sm text-white transition-colors hover:text-blush">{c.name}</Link>{c.primary ? <Star className="size-3.5 fill-current text-blush" aria-label="Primary contact" /> : null}</span> },
    { key: 'role', header: 'Role', hideOnMobile: true, cell: (c) => <span className="text-[#979797]">{c.role || '—'}</span> },
    { key: 'client', header: 'Client', cell: (c) => <span className="inline-flex items-center gap-2"><Link href={`/app/clients/${c.clientId}`} className="whitespace-nowrap text-white transition-colors hover:text-blush">{c.clientName}</Link><ClientStatusPill status={c.clientStatus} /></span> },
    { key: 'email', header: 'Email', hideOnMobile: true, cell: (c) => (c.email ? <a href={`mailto:${c.email}`} className="text-[#979797] transition-colors hover:text-white">{c.email}</a> : '—') },
    { key: 'phone', header: 'Phone', hideOnMobile: true, className: 'whitespace-nowrap', cell: (c) => (c.phone ? <a href={`tel:${c.phone}`} className="tabular-nums text-[#979797] transition-colors hover:text-white">{c.phone}</a> : '—') },
    { key: 'deals', header: 'Open deals', align: 'right', cell: (c) => <span className="tabular-nums">{c.openDeals}</span> },
  ]
  const pastEnd = <EmptyState icon={<Contact />} title="Nothing on this page" description="This page is past the end of the list." action={<Button variant="secondary" href={buildHref(BASE, sp, { page: undefined })}>Go to page 1</Button>} compact />
  type Prospect = NonNullable<typeof prospectsData>['rows'][number]
  const prospectColumns: Column<Prospect>[] = [
    { key: 'name', header: 'Name', cell: (l) => <span className="text-sm text-white">{l.contactName}</span> },
    { key: 'designation', header: 'Designation', hideOnMobile: true, cell: (l) => <span className="text-[#979797]">{l.designation || '—'}</span> },
    { key: 'company', header: 'Company', cell: (l) => <Link href={`/app/orbit/leads/${l._id}`} className="relative z-10 text-white transition-colors hover:text-blush">{l.companyName}</Link> },
    { key: 'email', header: 'Email', hideOnMobile: true, cell: (l) => <span className="text-[#979797]">{l.email || '—'}</span> },
    { key: 'phone', header: 'Phone', hideOnMobile: true, className: 'whitespace-nowrap', cell: (l) => <span className="tabular-nums text-[#979797]">{l.phone || '—'}</span> },
    { key: 'stage', header: 'Stage', cell: (l) => <LeadStageBadge stage={l.stage as LeadStage} /> },
    { key: 'owner', header: 'Owner', hideOnMobile: true, cell: (l) => (index ? nameOf(index, l.ownerId) : '—') },
  ]

  return (
    <>
      <PageHeader title="Contacts" help="clients-leads-contacts" description="People you sell to: contacts at your clients, plus the people on open leads." breadcrumb={breadcrumbFor(BASE)} icon={<Contact />} actions={<><SearchInput placeholder="Search contacts" />{addButton}</>}>
        <div className="flex flex-wrap items-center gap-2">
          <LinkTabs tabs={[{ href: BASE, label: 'Client contacts' }, { href: `${BASE}?tab=prospects`, label: 'Lead contacts' }]} />
          {tab === 'clients' ? (
            <>
              <span className="flex-1" />
              <UrlSelect param="status" label="Client status" allLabel="Any client status" options={[{ value: 'active', label: 'Active' }, { value: 'lead', label: 'Lead' }, { value: 'inactive', label: 'Inactive' }]} />
              <FilterChip href={buildHref(BASE, sp, { primary: primaryOnly ? undefined : '1', page: undefined })} active={primaryOnly} icon={<Star />}>Primary only</FilterChip>
            </>
          ) : null}
        </div>
      </PageHeader>
      {clientsData ? (
        <>
          <DataTable columns={columns} rows={clientsData.rows} rowKey={(c) => c.id} empty={clientsData.total > 0 ? pastEnd : <EmptyState icon={<Contact />} title={q ? `No contacts match "${q}"` : 'No contacts yet'} description={q ? undefined : 'Contacts live on clients; add one, or convert a lead to bring its contact over.'} action={q ? undefined : addButton} compact />} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={clientsData.total} basePath={BASE} params={sp} />
        </>
      ) : null}
      {prospectsData ? (
        <>
          <DataTable columns={prospectColumns} rows={prospectsData.rows} rowKey={(l) => String(l._id)} rowHref={(l) => `/app/orbit/leads/${l._id}`} empty={prospectsData.total > 0 ? pastEnd : <EmptyState icon={<Contact />} title="No open leads with a contact name" compact />} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={prospectsData.total} basePath={BASE} params={sp} />
        </>
      ) : null}
    </>
  )
}
