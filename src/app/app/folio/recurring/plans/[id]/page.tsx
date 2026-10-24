import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { Layers, ListChecks, Percent } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { DataTable, type Column } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { PhaseActions, PlanActions } from '@/components/folio/PlanActions'
import { PlanForm } from '@/components/folio/PlanForm'
import { Callout } from '@/components/folio/SetupCallout'
import { FolioStatus } from '@/components/folio/StatusBadge'
import { EMBEDDED_TABLE, Figure, HeroCard, LINK, PanelHeader, TableCard } from '@/components/folio/ui'
import { planFormOptions } from '@/components/folio/plan-options'
import { Client } from '@/models/Client'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { Invoice } from '@/models/folio/Invoice'
import { milestoneAmount } from '@/modules/folio/recurring/plan-math'
import { invoicedByPlan } from '@/modules/folio/recurring/plans'

export const metadata: Metadata = { title: 'Billing plan' }

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  if (!isValidObjectId(id)) notFound()
  const plan = await ctx.db(FolioBillingPlan).findById(id).lean()
  if (!plan) notFound()
  const canEdit = ctx.can('recurring.write')

  if (first(sp.edit) === '1' && canEdit && plan.status !== 'cancelled') {
    const opts = await planFormOptions(ctx, String(plan.clientId))
    const values = {
      id,
      clientId: String(plan.clientId),
      entityId: String(plan.entityId),
      workProjectId: plan.workProjectId ? String(plan.workProjectId) : '',
      name: plan.name,
      description: plan.description ?? '',
      hsnSac: plan.hsnSac ?? '',
      totalValue: (plan.totalValuePaise / 100).toFixed(2),
      gstRatePercent: String(plan.gstRatePercent),
      startDate: plan.startDate ?? '',
      targetEndDate: plan.targetEndDate ?? '',
      status: plan.status,
      notes: plan.notes ?? '',
      milestones: plan.milestones.map((m) => ({
        key: String(m._id), id: String(m._id), name: m.name, description: m.description ?? '', mode: m.amountPaise != null ? ('amount' as const) : ('percent' as const),
        percent: m.percentOfTotal != null ? String(m.percentOfTotal) : '', amount: m.amountPaise != null ? (m.amountPaise / 100).toFixed(2) : '', dueOn: m.dueOn ?? '', locked: Boolean(m.invoiceId) || m.status === 'invoiced' || m.status === 'paid',
      })),
    }
    return (
      <>
        <PageHeader title={`Edit ${plan.code}`} icon={<Layers />} back={{ href: `/app/folio/recurring/plans/${id}`, label: plan.name }} description="Invoiced phases keep their amount." />
        <PlanForm values={values} clients={opts.clients} entities={opts.entities} projects={opts.projects} taxRates={opts.taxRates} />
      </>
    )
  }

  const [client, invoiced, invoices] = await Promise.all([
    ctx.db(Client).findById(plan.clientId, { name: 1 }).lean(),
    invoicedByPlan(ctx, [plan._id]),
    ctx.db(Invoice).find({ planId: plan._id }, { number: 1, status: 1 }).lean(),
  ])
  const billed = invoiced.get(String(plan._id)) ?? 0
  const billedPercent = plan.totalValuePaise ? Math.round((billed / plan.totalValuePaise) * 100) : 0
  const invoiceOf = new Map(invoices.map((i) => [String(i._id), i]))
  const canRaise = ctx.can('invoices.write') && plan.status !== 'cancelled' && plan.status !== 'completed'
  type Phase = (typeof plan.milestones)[number]
  const columns: Column<Phase>[] = [
    { key: 'position', header: '#', cell: (m) => <span className="tabular-nums text-[#979797]">{m.position}</span> },
    { key: 'name', header: 'Phase', cell: (m) => <span><span className="block text-fg">{m.name}</span>{m.description ? <span className="block text-xs text-fg-2">{m.description}</span> : null}</span> },
    { key: 'dueOn', header: 'Due', hideOnMobile: true, cell: (m) => <span className="text-[#979797]">{formatDate(m.dueOn)}</span> },
    { key: 'status', header: 'Status', cell: (m) => <FolioStatus status={m.status} /> },
    { key: 'invoice', header: 'Invoice', hideOnMobile: true, cell: (m) => (m.invoiceId ? <Link href={`/app/folio/invoices/${m.invoiceId}`} className={LINK}>{invoiceOf.get(String(m.invoiceId))?.number ?? 'Draft'}</Link> : <span className="text-fg-3">—</span>) },
    { key: 'amount', header: 'Amount', align: 'right', cell: (m) => <span className="tabular-nums text-fg">{formatINR(milestoneAmount(plan.totalValuePaise, m), { decimals: 0 })}{m.percentOfTotal != null ? <span className="ml-1 text-xs text-fg-3">{m.percentOfTotal}%</span> : null}</span> },
    { key: 'actions', header: '', align: 'right', cell: (m) => <PhaseActions planId={id} milestoneId={String(m._id)} amountPaise={milestoneAmount(plan.totalValuePaise, m)} canRaise={canRaise && !m.invoiceId && m.status === 'pending'} canCancel={canEdit && !m.invoiceId && m.status === 'pending'} /> },
  ]
  return (
    <>
      <PageHeader title={plan.name} icon={<Layers />} back={{ href: '/app/folio/recurring?tab=plans', label: 'Billing plans' }} description={`${plan.code} · ${client?.name ?? 'Unknown client'}`} actions={<PlanActions id={id} status={plan.status} canEdit={canEdit} />}>
        <FolioStatus status={plan.status} />
      </PageHeader>
      <HeroCard className="mb-4">
        <PanelHeader icon={<Percent />} title="Billed so far" subtitle={`${formatINR(billed, { decimals: 0 })} of ${formatINR(plan.totalValuePaise, { decimals: 0 })} invoiced, before tax`} />
        <Progress className="mt-4" size="lg" value={billedPercent} label="Invoiced" />
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line-soft/40">
          <Figure className="sm:pr-6" label="Value" value={formatINRCompact(plan.totalValuePaise)} hint={`Before tax · GST ${plan.gstRatePercent}%`} />
          <Figure className="sm:px-6" label="Left to bill" value={formatINRCompact(Math.max(0, plan.totalValuePaise - billed))} hint={`${plan.milestones.length} ${plan.milestones.length === 1 ? 'phase' : 'phases'} in the plan`} />
          <Figure
            className="sm:pl-6"
            label="Client"
            value={
              <Link href={`/app/clients/${plan.clientId}`} className="block truncate text-lg leading-8 transition-colors hover:text-blush">
                {client?.name ?? '—'}
              </Link>
            }
          />
        </div>
      </HeroCard>
      {plan.status === 'cancelled' ? <Callout tone="warning" className="mb-4" title="This plan is cancelled.">No more phases can be invoiced.</Callout> : null}
      <TableCard icon={<ListChecks />} title="Phases" subtitle="Each phase becomes a draft invoice when you raise it">
        <DataTable className={EMBEDDED_TABLE} columns={columns} rows={plan.milestones} rowKey={(m) => String(m._id)} empty={<p className="py-8 text-center text-[13px] text-fg-2">No phases yet. Edit the plan to add them.</p>} />
      </TableCard>
    </>
  )
}
