import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { FilePlus, FolderPlus, Handshake } from 'lucide-react'
import { requireMember, type Ctx } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { stateLabel } from '@/lib/india-states'
import { first, type SearchParams } from '@/lib/list'
import { Badge } from '@/components/ui/badge'
import { ClientStatusPill } from '@/components/clients/client-status-pill'
import { Button } from '@/components/ui/button'
import { LinkTabs } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { ClientMark } from '@/components/clients/client-mark'
import { ClientMenu } from '@/components/clients/client-menu'
import { ActivityTab } from '@/components/clients/tabs/activity-tab'
import { ContactsTab } from '@/components/clients/tabs/contacts-tab'
import { DealsTab } from '@/components/clients/tabs/deals-tab'
import { FolioInvoices, FolioLedger, FolioLocked } from '@/components/clients/tabs/folio-tabs'
import { OverviewTab } from '@/components/clients/tabs/overview-tab'
import { ProjectsTab } from '@/components/clients/tabs/projects-tab'
import { DealFormDialog } from '@/components/orbit/deal-form-dialog'
import { Client } from '@/models/Client'
import { clientActivity, clientDeals, clientOverview, clientProjects } from '@/modules/clients/detail'
import { clientFormOptions, clientValues } from '@/modules/clients/form-options'
import { clientColumns } from '@/modules/clients/queries'
import { loadChoices } from '@/modules/orbit/choices'
import { STAGE_COLORS } from '@/modules/orbit/constants'
import { dealStageLabel } from '@/modules/orbit/dealStage'
import { nameOf, peopleIndex } from '@/modules/orbit/people'
import { fileUrl } from '@/lib/files'
import { TaskWorkspace } from '@/components/work/tasks/task-workspace'
import { parseTaskQuery } from '@/modules/work/tasks/filters'
import { taskData } from '@/modules/work/tasks/options'
import { getViewer } from '@/modules/work/tasks/viewer'
import { ClientPortalCard, type PortalContactRow } from '@/components/portal/client-portal-card'
import { PortalContact } from '@/models/portal/PortalContact'
import { portalPath } from '@/modules/portal/session'
import { appUrl } from '@/lib/env'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Client' }
const TAB_KEYS = ['overview', 'contacts', 'projects', 'tasks', 'deals', 'invoices', 'ledger', 'activity'] as const
type Tab = (typeof TAB_KEYS)[number]

/** The client's Work tasks with the usual filters and views; rows open in the task side panel. */
async function clientTasks(ctx: Ctx, clientId: string, base: string, sp: SearchParams) {
  const viewer = await getViewer(ctx)
  const data = await taskData(ctx, viewer)
  const query = { ...parseTaskQuery(sp, { view: 'list' }), client: [clientId], personal: false }
  return <TaskWorkspace ctx={ctx} viewer={viewer} data={data} query={query} basePath={`${base}?tab=tasks`} pathname={base} sp={sp} locked={['client', 'personal']} />
}

/** The client portal controls (feature 'portal'): on/off, the link, invited people. */
async function portalCard(ctx: Ctx, client: { id: string; name: string; enabled: boolean }) {
  const contacts = await ctx.db(PortalContact).find({ clientId: client.id, status: 'active' }).sort({ createdAt: 1 }).lean()
  const rows: PortalContactRow[] = contacts.map((c) => ({ id: String(c._id), name: c.name, email: c.email, status: 'active', lastSignIn: c.lastSignInAt ? formatDate(c.lastSignInAt) : null }))
  return <ClientPortalCard clientId={client.id} clientName={client.name} enabled={client.enabled} url={appUrl(portalPath(ctx.org.slug, '/login'))} contacts={rows} canEdit={ctx.can('clients.write')} />
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ anyProduct: ['work', 'orbit', 'folio'], perm: 'clients.read' })
  if (!isValidObjectId(id)) notFound()
  const client = await ctx.db(Client).findById(id).lean()
  if (!client) notFound()
  const cols = clientColumns(ctx)
  const folioOn = ctx.has('folio')
  const visible: Record<Tab, boolean> = { overview: true, contacts: true, projects: cols.work, tasks: ctx.has('work') && ctx.can('tasks.read'), deals: cols.orbit, invoices: folioOn ? ctx.can('folio.read') : true, ledger: folioOn ? ctx.can('folio.read') : true, activity: true }
  const requested = first(sp.tab) as Tab | undefined
  const tab: Tab = requested && TAB_KEYS.includes(requested) && visible[requested] ? requested : 'overview'
  const base = `/app/clients/${id}`
  const { cfg, people, choices } = await loadChoices(ctx)
  const index = peopleIndex(people)
  const today = todayIST()
  const canWrite = ctx.can('clients.write')
  const canEditContacts = ctx.canAny('clients.write', 'contacts.write')
  const primary = client.contacts.find((c) => c.primary) ?? client.contacts[0] ?? null

  const newDeal = cols.orbit && ctx.can('deals.write') ? (
    <DealFormDialog choices={choices} canAssign={ctx.can('orbit.close')} canCreateClient={false} today={today} fixedClient={{ id, name: client.name }} trigger={<Button size="sm" variant="primary" icon={<Handshake className="size-4" />}>New deal</Button>} />
  ) : null
  const newProject = cols.work && ctx.can('projects.write') ? <Button size="sm" variant="secondary" icon={<FolderPlus className="size-4" />} href={`/app/work/projects?new=1&clientId=${id}`}>New project</Button> : null
  const newInvoice = folioOn && ctx.can('invoices.write') ? <Button size="sm" variant="secondary" icon={<FilePlus className="size-4" />} href={`/app/folio/invoices/new?clientId=${id}`}>New invoice</Button> : null

  const tabs = TAB_KEYS.filter((k) => visible[k]).map((k) => ({
    href: k === 'overview' ? base : `${base}?tab=${k}`,
    label: { overview: 'Overview', contacts: 'Contacts', projects: 'Projects', tasks: 'Tasks', deals: 'Deals', invoices: 'Invoices', ledger: 'Ledger', activity: 'Activity' }[k],
    count: k === 'contacts' ? client.contacts.length : undefined,
  }))

  const [overview, formOptions, projects, dealData, activity] = await Promise.all([
    tab === 'overview' ? clientOverview(ctx, client._id, index) : null,
    tab === 'overview' ? clientFormOptions(ctx) : null,
    tab === 'projects' ? clientProjects(ctx, client._id) : null,
    tab === 'deals' ? clientDeals(ctx, client._id) : null,
    tab === 'activity' ? clientActivity(ctx, client._id, cfg, index) : null,
  ])
  const stageColor = (key: string) => STAGE_COLORS[cfg.dealStages.find((s) => s.key === key)?.color ?? 'sky']

  return (
    <>
      <PageHeader
        title={client.name}
        description={client.displayName || undefined}
        back={{ href: '/app/clients', label: 'Clients' }}
        icon={<ClientMark name={client.name} kind={client.kind} size="lg" className="-mt-0.5" logoUrl={client.logoFileId ? fileUrl(client.logoFileId) : null} />}
        actions={<>{newDeal}{newProject}{newInvoice}<ClientMenu id={id} name={client.name} status={client.status} canWrite={canWrite} canDelete={ctx.can('clients.delete')} /></>}
      >
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#979797]">
          <ClientStatusPill status={client.status} />
          {client.gstin ? <span>GSTIN <span className="tabular-nums text-white">{client.gstin}</span></span> : null}
          {client.state ? <span className="text-white">{stateLabel(client.state)}</span> : null}
          {client.ownerId ? <span>Owner <span className="text-white">{nameOf(index, client.ownerId)}</span></span> : null}
          {(client.tags ?? []).length ? <span className="flex flex-wrap gap-1.5">{(client.tags ?? []).map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span> : null}
        </div>
        <LinkTabs tabs={tabs} />
      </PageHeader>

      {overview && formOptions ? <OverviewTab logoUrl={client.logoFileId ? fileUrl(client.logoFileId) : null} clientName={client.name} clientKind={client.kind} clientId={id} values={clientValues(client)} overview={overview} primary={primary} options={formOptions} canEdit={canWrite} today={today} /> : null}
      {tab === 'contacts' ? <ContactsTab clientId={id} contacts={client.contacts} canEdit={canEditContacts} linkToOrbit={cols.orbit} /> : null}
      {tab === 'contacts' && ctx.hasFeature('portal') ? await portalCard(ctx, { id, name: client.name, enabled: Boolean(client.portal?.enabled) }) : null}
      {tab === 'projects' ? (
        <ProjectsTab newProject={newProject} projects={projects ? projects.map((p) => ({ id: String(p._id), code: p.code, name: p.name, status: p.status, health: p.health, leadName: nameOf(index, p.leadId), endDate: p.endDate ?? null })) : null} />
      ) : null}
      {tab === 'tasks' ? await clientTasks(ctx, id, base, sp) : null}
      {dealData ? (
        <DealsTab
          newDeal={newDeal}
          deals={dealData.deals.map((d) => ({ id: String(d._id), title: d.title, stageLabel: dealStageLabel(cfg.dealStages, d.stage), color: stageColor(d.stage), status: d.status as 'open' | 'won' | 'lost', valuePaise: d.valuePaise, probability: d.probability, expectedCloseDate: d.expectedCloseDate ?? null, ownerName: nameOf(index, d.ownerId) }))}
          leads={dealData.leads.map((l) => ({ id: String(l._id), companyName: l.companyName, convertedAt: l.convertedAt ?? null }))}
        />
      ) : null}
      {tab === 'invoices' ? (folioOn ? <FolioInvoices clientId={id} /> : <FolioLocked />) : null}
      {tab === 'ledger' ? (folioOn ? <FolioLedger clientId={id} from={first(sp.from)} to={first(sp.to)} /> : <FolioLocked />) : null}
      {activity ? <ActivityTab activities={activity.activities} events={activity.events} today={today} showOrbit={cols.orbit} /> : null}
    </>
  )
}
