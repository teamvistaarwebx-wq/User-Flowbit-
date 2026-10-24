import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Building2, CalendarClock, CalendarDays, CalendarPlus, Handshake, Layers, ListChecks, Plus, Sprout, UserRound, Waypoints } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { formatINR, formatINRCompact } from '@/lib/money'
import { StatusPill } from '@/components/ui/badge'
import { ClientStatusPill } from '@/components/clients/client-status-pill'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { ActivityList } from '@/components/orbit/activity-row'
import { DealDetailsForm } from '@/components/orbit/deal-details-form'
import { DealStageCard } from '@/components/orbit/deal-stage-card'
import { DeleteRecordButton } from '@/components/orbit/delete-record-button'
import { FolioCard } from '@/components/orbit/folio-card'
import { LogActivityDialog } from '@/components/orbit/log-activity-dialog'
import { Fact, OverviewCard, PanelHeader, SolidCard, TableCard } from '@/components/orbit/parts'
import { RecordTimeline } from '@/components/orbit/record-timeline'
import { ScheduleDialog } from '@/components/orbit/schedule-dialog'
import { DealStageBadge } from '@/components/orbit/stage-badge'
import { Client } from '@/models/Client'
import { loadChoices } from '@/modules/orbit/choices'
import { labelFrom } from '@/modules/orbit/constants'
import { dealStageLabel } from '@/modules/orbit/dealStage'
import { originLead, recordHistory } from '@/modules/orbit/detail.queries'
import { folioLinksForDeal } from '@/modules/orbit/folio-links'
import { daysAgo, weighted } from '@/modules/orbit/metrics'
import { nameOf, peopleIndex } from '@/modules/orbit/people'
import { canEditDeal, leadAccess, loadDeal } from '@/modules/orbit/scope'
import { Lead } from '@/models/orbit/Lead'

export const metadata: Metadata = { title: 'Deal' }

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  const deal = await loadDeal(ctx, id).catch((error: unknown) => (error instanceof NotFoundError ? null : Promise.reject(error)))
  if (!deal) notFound()
  const { cfg, people, choices } = await loadChoices(ctx)
  const index = peopleIndex(people)
  const today = todayIST()
  const status = deal.status as 'open' | 'won' | 'lost'
  const [history, client, lead, links] = await Promise.all([
    recordHistory(ctx, cfg, people, { dealId: deal._id }),
    deal.clientId && ctx.can('clients.read') ? ctx.db(Client).findById(deal.clientId).lean() : null,
    originLead(ctx, deal.leadId),
    ctx.can('folio.read') ? folioLinksForDeal(ctx, deal._id) : Promise.resolve([]),
  ])
  const leadVisible = lead ? await ctx.db(Lead).exists({ _id: lead._id, ...leadAccess(ctx) }) : null
  const before = lead && leadVisible ? await recordHistory(ctx, cfg, people, { leadId: lead._id }) : null
  const canEdit = canEditDeal(ctx, deal)
  const canLog = canEdit && ctx.can('activities.write')
  const color = choices.dealStages.find((s) => s.key === deal.stage)?.color ?? 'var(--orbit)'
  const related = { dealId: String(deal._id) }
  const contacts = (client?.contacts ?? []).map((c) => ({ value: String(c._id), label: c.name, hint: c.primary ? 'primary' : (c.role ?? undefined) }))
  const primary = client?.contacts.find((c) => c.primary) ?? client?.contacts[0]
  const closeNote = deal.status === 'lost' && deal.lostReason ? `${labelFrom(cfg.lostReasons, deal.lostReason.code)}${deal.lostReason.note ? ` — ${deal.lostReason.note}` : ''}` : deal.status === 'won' && deal.wonReason ? labelFrom(cfg.wonReasons, deal.wonReason) : null
  const openFolio = links.find((l) => l.kind === 'invoice') ?? links[0]

  return (
    <>
      <PageHeader
        title={deal.title}
        description={client ? client.name : undefined}
        icon={<Handshake />}
        back={{ href: '/app/orbit/deals', label: 'Deals' }}
        actions={
          <>
            {canLog && status === 'open' ? <ScheduleDialog related={related} today={today} assignees={ctx.can('orbit.close') ? choices.owners : undefined} defaultAssigneeId={String(deal.ownerId)} trigger={<Button variant="secondary" icon={<CalendarPlus className="size-4" />}>Schedule follow-up</Button>} /> : null}
            {canLog ? <LogActivityDialog related={related} defaultType="call" today={today} trigger={<Button variant="primary" icon={<Plus className="size-4" />}>Log activity</Button>} /> : null}
            {ctx.can('orbit.settings') && !deal.leadId && !links.length ? <DeleteRecordButton kind="deal" id={String(deal._id)} title={`Delete '${deal.title}'?`} description="The deal and its activity history are removed. Reports stop counting it." /> : null}
          </>
        }
      />

      <div className="grid grid-cols-12 gap-3 xl:gap-[15px]">
        <div className="col-span-12 space-y-3 lg:col-span-8">
          <DealStageCard
            deal={{ id: String(deal._id), title: deal.title, stage: deal.stage, status, valuePaise: deal.valuePaise, closeNote }}
            choices={choices}
            can={{ edit: canEdit, close: ctx.can('orbit.close') }}
            folioWarning={openFolio ? openFolio.label : null}
            today={today}
          />
          <TableCard icon={<CalendarClock />} title="Upcoming" subtitle="Calls and meetings scheduled on this deal">
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={history.upcoming} today={today} canAct={canEdit} showRelated={false} empty={status === 'open' ? 'No next step. Schedule the next call or meeting.' : 'Nothing scheduled.'} />
            </div>
          </TableCard>
          <RecordTimeline entries={history.timeline} today={today} canDelete={ctx.can('orbit.settings')} empty="No activity yet. Log a call or schedule the next step.">
            {before && lead ? (
              <details className="group rounded-[10px] bg-control px-4 py-3">
                <summary className="cursor-pointer list-none text-[13px] text-fg-2 marker:hidden">
                  <span className="text-white">Before conversion</span> · <Link href={`/app/orbit/leads/${lead._id}`} className="text-link transition-colors hover:text-white">{lead.companyName}</Link> ({before.timeline.length} entries)
                </summary>
                <div className="mt-3"><RecordTimeline bare entries={before.timeline} today={today} canDelete={false} empty="Nothing was logged on the lead." /></div>
              </details>
            ) : null}
          </RecordTimeline>
        </div>
        <div className="col-span-12 space-y-3 lg:col-span-4">
          <OverviewCard>
            <PanelHeader icon={<Handshake />} title="Deal" actions={<StatusPill status={status} />} />
            <p className="mt-3 text-2xl font-semibold leading-[30px] tabular-nums text-white">{formatINR(deal.valuePaise, { decimals: 0 })}</p>
            <p className="text-xs text-[#979797]">Weighted {formatINRCompact(weighted(deal.valuePaise, deal.probability))} at {deal.probability}%</p>
            <div className="mt-4 border-t border-line-soft pt-2">
              <Fact icon={<Layers strokeWidth={1.5} />} label="Stage">{status === 'open' ? <DealStageBadge label={dealStageLabel(cfg.dealStages, deal.stage)} color={color} status={status} /> : <StatusPill status={status} />}</Fact>
              <Fact icon={<Building2 strokeWidth={1.5} />} label="Client">{client ? <Link href={`/app/clients/${client._id}`} className="transition-colors hover:text-blush">{client.name}</Link> : null}</Fact>
              <Fact icon={<UserRound strokeWidth={1.5} />} label="Owner">{nameOf(index, deal.ownerId)}</Fact>
              <Fact icon={<CalendarDays strokeWidth={1.5} />} label="Expected close">{deal.expectedCloseDate ? <span className={status === 'open' && deal.expectedCloseDate < today ? 'text-[#FF2D31]' : undefined}>{formatDate(deal.expectedCloseDate)}</span> : null}</Fact>
              {deal.source ? <Fact icon={<Waypoints strokeWidth={1.5} />} label="Source">{labelFrom(cfg.sources, deal.source)}</Fact> : null}
            </div>
          </OverviewCard>
          <FolioCard
            entitled={ctx.has('folio')}
            won={status === 'won'}
            canQuote={ctx.can('quotes.write')}
            canInvoice={ctx.can('invoices.write')}
            links={links}
            query={{ clientId: deal.clientId ? String(deal.clientId) : null, dealId: String(deal._id), title: deal.title, amountPaise: deal.valuePaise }}
          />
          <SolidCard>
            <PanelHeader icon={<ListChecks />} title="Details" className="mb-4" />
            <DealDetailsForm
              values={{
                id: String(deal._id), title: deal.title, valuePaise: deal.valuePaise, probability: deal.probability, expectedCloseDate: deal.expectedCloseDate ?? null,
                contactId: deal.contactId ? String(deal.contactId) : null, source: deal.source ?? null, sector: deal.sector ?? null, ownerId: String(deal.ownerId),
                ownerName: nameOf(index, deal.ownerId), notes: deal.notes ?? '', clientId: deal.clientId ? String(deal.clientId) : null, open: status === 'open',
              }}
              contacts={contacts}
              choices={choices}
              canEdit={canEdit}
              canAssign={ctx.can('orbit.close')}
              canAddContact={ctx.canAny('clients.write', 'contacts.write')}
            />
          </SolidCard>
          {client ? (
            <SolidCard>
              <PanelHeader icon={<Building2 />} title="Client" actions={<Link href={`/app/clients/${client._id}`} className="text-xs font-medium text-white transition-opacity hover:opacity-75">Open client</Link>} className="mb-3" />
              <Fact label="Name">{client.name}</Fact>
              <Fact label="Status"><ClientStatusPill status={client.status} /></Fact>
              <Fact label="Primary contact">{primary ? primary.name : null}</Fact>
              {primary?.email ? <Fact label="Email"><a className="text-link transition-colors hover:text-white" href={`mailto:${primary.email}`}>{primary.email}</a></Fact> : null}
              {primary?.phone ? <Fact label="Phone"><a className="transition-colors hover:text-blush" href={`tel:${primary.phone}`}>{primary.phone}</a></Fact> : null}
              <Fact label="GSTIN">{client.gstin ? <span className="tabular-nums">{client.gstin}</span> : null}</Fact>
            </SolidCard>
          ) : null}
          {lead ? (
            <SolidCard>
              <PanelHeader icon={<Sprout />} title="Origin" subtitle="The lead this deal came from" className="mb-3" />
              <Fact label="Lead">{leadVisible ? <Link className="text-link transition-colors hover:text-white" href={`/app/orbit/leads/${lead._id}`}>{lead.companyName}</Link> : lead.companyName}</Fact>
              <Fact label="Source">{labelFrom(cfg.sources, lead.source)}</Fact>
              <Fact label="Sector">{labelFrom(cfg.sectors, lead.sector)}</Fact>
              <Fact label="First contacted">{lead.contactedAt ? formatDate(lead.contactedAt) : null}</Fact>
              <Fact label="Meeting done">{lead.meetingDoneAt ? formatDate(lead.meetingDoneAt) : null}</Fact>
              <Fact label="Converted">{lead.convertedAt ? formatDate(lead.convertedAt) : null}</Fact>
              {status === 'won' && lead.contactedAt && deal.closedAt ? <Fact label="First contact to win">{`${daysAgo(lead.contactedAt, deal.closedAt)} days`}</Fact> : null}
            </SolidCard>
          ) : null}
        </div>
      </div>
    </>
  )
}
