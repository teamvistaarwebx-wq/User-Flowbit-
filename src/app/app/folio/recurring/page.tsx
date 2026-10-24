import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarClock, FolderKanban, Layers, Plus, Repeat } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components/ui/stat-card'
import { LinkTabs } from '@/components/ui/tabs'
import { GenerateDraftsButton } from '@/components/folio/GenerateDraftsButton'
import { RetainerDialog, type RetainerValues } from '@/components/folio/RetainerDialog'
import { RetainerRowActions } from '@/components/folio/RetainerRowActions'
import { Callout, SetupCallout } from '@/components/folio/SetupCallout'
import { FolioStatus } from '@/components/folio/StatusBadge'
import { EMBEDDED_TABLE, TableCard } from '@/components/folio/ui'
import { builderOptions } from '@/modules/folio/invoices/builder-data'
import { planOverview, retainerOverview, type RetainerRow } from '@/modules/folio/recurring/queries'
import { FREQUENCY_LABELS } from '@/modules/folio/types'
import { cn } from '@/lib/utils'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Recurring' }

const BASE = '/app/folio/recurring'

type PlanRow = Awaited<ReturnType<typeof planOverview>>[number]

export default async function RecurringPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const tab = first(sp.tab) === 'plans' ? 'plans' : 'retainers'
  const canEdit = ctx.can('recurring.write')
  const canBill = ctx.can('invoices.write')
  const options = await builderOptions(ctx)
  const ready = options.entities.length > 0
  const clients = options.clients.map((c) => ({ value: c.id, label: c.name }))
  const entities = options.entities.map((e) => ({ value: e.id, label: `${e.code} · ${e.name}`, kind: e.kind }))
  const blank: RetainerValues = { clientId: '', entityId: options.entities.find((e) => e.isDefault)?.id ?? options.entities[0]?.id ?? '', name: '', description: '', hsnSac: '', amount: '', gstRatePercent: '18', frequency: 'monthly', startDate: todayIST(), endDate: '', billingDay: '1', billInAdvance: true, autoGenerate: true, paymentTermsDays: '', hoursPerMonth: '', notes: '' }
  const newRetainer = canEdit && ready ? <RetainerDialog trigger={<Button variant="primary" icon={<Plus className="size-4" />}>New retainer</Button>} values={blank} clients={clients} entities={entities} taxRates={options.taxRates} /> : null
  const newPlan = canEdit && ready ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/plans/new`}>New plan</Button> : null

  const header = (actions: ReactNode) => (
    <PageHeader title="Recurring" help="folio-documents" icon={<Repeat />} breadcrumb={breadcrumbFor(BASE)} description="Retainers that draft themselves, and plans billed in phases." actions={<><Button variant="ghost" icon={<CalendarClock className="size-4" />} href="/app/folio/forecast">Forecast</Button>{actions}</>}>
      <LinkTabs tabs={[{ href: BASE, label: 'Retainers' }, { href: `${BASE}?tab=plans`, label: 'Billing plans' }]} />
    </PageHeader>
  )

  if (tab === 'plans') {
    const plans = await planOverview(ctx)
    const columns: Column<PlanRow>[] = [
      { key: 'name', header: 'Plan', cell: (r) => <span><span className="block font-medium text-fg">{r.name}</span><span className="block text-xs text-fg-2">{r.code} · {r.milestones.length} phases</span></span> },
      { key: 'client', header: 'Client', cell: (r) => <Link href={`/app/clients/${r.clientId}`} className="text-white/85 transition-colors hover:text-blush">{r.clientName}</Link> },
      { key: 'status', header: 'Status', cell: (r) => <FolioStatus status={r.status} /> },
      { key: 'billed', header: 'Billed', hideOnMobile: true, cell: (r) => <span className="flex items-center gap-2.5"><Progress className="w-28" value={r.billedPercent} /><span className="w-9 text-right text-xs tabular-nums text-white/75">{r.billedPercent}%</span></span> },
      { key: 'invoiced', header: 'Invoiced', align: 'right', hideOnMobile: true, cell: (r) => <span className="tabular-nums">{formatINR(r.invoicedPaise, { decimals: 0 })}</span> },
      { key: 'value', header: 'Value', align: 'right', cell: (r) => <span className="tabular-nums text-fg">{formatINR(r.totalValuePaise, { decimals: 0 })}</span> },
    ]
    return (
      <>
        {header(newPlan)}
        {!ready ? <SetupCallout canSetUp={ctx.can('folio.settings')} /> : null}
        <TableCard icon={<Layers />} title="Billing plans" subtitle={`${plans.length} ${plans.length === 1 ? 'plan' : 'plans'}, an agreed value billed in phases`}>
          <DataTable className={EMBEDDED_TABLE} columns={columns} rows={plans} rowKey={(r) => String(r._id)} rowHref={(r) => `${BASE}/plans/${r._id}`} empty={<EmptyState icon={<FolderKanban />} title="No billing plans yet" description="A plan is worth setting up when the money is agreed up front and billed in stages." action={newPlan} />} />
        </TableCard>
      </>
    )
  }

  const data = await retainerOverview(ctx)
  const columns: Column<RetainerRow>[] = [
    { key: 'name', header: 'Retainer', cell: (r) => <span><span className="block font-medium text-fg">{r.name}</span>{r.entityCode ? <span className="block text-xs text-fg-2">{r.entityCode}</span> : null}</span> },
    { key: 'client', header: 'Client', cell: (r) => <Link href={`/app/clients/${r.clientId}`} className="text-white/85 transition-colors hover:text-blush">{r.clientName}</Link> },
    { key: 'frequency', header: 'Every', hideOnMobile: true, cell: (r) => FREQUENCY_LABELS[r.frequency] },
    { key: 'next', header: 'Next invoice', cell: (r) => (r.schedule.next ? <span className={cn('whitespace-nowrap', r.schedule.due.length ? 'text-[#FF2D31]' : 'text-[#979797]')}>{formatDate(r.schedule.next)}{r.schedule.due.length ? ` · due${r.schedule.due.length > 1 ? ` (${r.schedule.due.length})` : ''}` : ''}</span> : <span className="text-fg-3">—</span>) },
    { key: 'status', header: 'Status', cell: (r) => <FolioStatus status={r.status} /> },
    { key: 'raised', header: 'Raised', align: 'right', hideOnMobile: true, cell: (r) => r.schedule.raised },
    { key: 'amount', header: 'Amount', align: 'right', cell: (r) => <span className="tabular-nums text-fg">{formatINR(r.amountPaise, { decimals: 0 })}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <RetainerRowActions
          values={{ id: String(r._id), clientId: String(r.clientId), entityId: String(r.entityId), name: r.name, description: r.description ?? '', hsnSac: r.hsnSac ?? '', amount: (r.amountPaise / 100).toFixed(2), gstRatePercent: String(r.gstRatePercent), frequency: r.frequency, startDate: r.startDate, endDate: r.endDate ?? '', billingDay: String(r.billingDay), billInAdvance: r.billInAdvance, autoGenerate: r.autoGenerate, paymentTermsDays: r.paymentTermsDays != null ? String(r.paymentTermsDays) : '', hoursPerMonth: r.hoursPerMonth != null ? String(r.hoursPerMonth) : '', notes: r.notes ?? '' }}
          status={r.status}
          invoicesHref={`/app/folio/invoices?client=${r.clientId}&q=${encodeURIComponent(r.name)}`}
          canEdit={canEdit}
          canBill={canBill}
          clients={clients}
          entities={entities}
          taxRates={options.taxRates}
        />
      ),
    },
  ]
  return (
    <>
      {header(
        <>
          {canBill && data.dueDrafts > 0 ? <GenerateDraftsButton count={data.dueDrafts} /> : null}
          {newRetainer}
        </>,
      )}
      {!ready ? <SetupCallout canSetUp={ctx.can('folio.settings')} /> : null}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Active retainers" value={data.activeCount} color="var(--violet)" />
        <StatCard label="Monthly run rate" value={formatINRCompact(data.runRatePaise)} hint="Quarterly ÷ 3, half-yearly ÷ 6, annual ÷ 12" color="var(--success)" />
        <StatCard label="Due for billing" value={<span className={cn(data.dueCount > 0 && 'text-warning')}>{data.dueCount}</span>} hint={data.dueCount ? `${data.dueDrafts} draft${data.dueDrafts === 1 ? '' : 's'} to create` : 'Nothing waiting'} color="var(--warning)" />
      </div>
      {data.dueCount > 0 && data.oldestDue ? (
        <Callout tone="warning" className="mb-4" title={`${data.dueCount} retainer${data.dueCount === 1 ? ' is' : 's are'} due for billing. The oldest is ${formatDate(data.oldestDue)}.`}>
          A retainer that nobody billed catches up rather than losing the revenue.
        </Callout>
      ) : null}
      <TableCard icon={<Repeat />} title="Retainers" subtitle="The same amount, billed to a client on a schedule">
        <DataTable className={EMBEDDED_TABLE} columns={columns} rows={data.rows} rowKey={(r) => String(r._id)} empty={<EmptyState icon={<Repeat />} title="No retainers yet" description="Add one to bill a client the same amount every month without rebuilding the invoice." action={newRetainer} />} />
      </TableCard>
    </>
  )
}
