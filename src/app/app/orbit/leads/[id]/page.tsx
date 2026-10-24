import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarClock, CalendarPlus, Gauge, Layers, ListChecks, Milestone, NotebookPen, Plus, ShoppingBag, Target, UserRound, Waypoints } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { formatDate, formatDateTime, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { ActivityList } from '@/components/orbit/activity-row'
import { DeleteRecordButton } from '@/components/orbit/delete-record-button'
import { LeadDetailsForm } from '@/components/orbit/lead-details-form'
import { LeadStageCard } from '@/components/orbit/lead-stage-card'
import { LeadSequenceCard } from '@/components/orbit/lead-sequence-card'
import { LogActivityDialog } from '@/components/orbit/log-activity-dialog'
import { Fact, IcpBars, OverviewCard, PanelHeader, SolidCard, TableCard } from '@/components/orbit/parts'
import { RecordTimeline } from '@/components/orbit/record-timeline'
import { ScheduleDialog } from '@/components/orbit/schedule-dialog'
import { LeadStageBadge } from '@/components/orbit/stage-badge'
import { loadChoices } from '@/modules/orbit/choices'
import { isOpenLead, labelFrom, type LeadStage } from '@/modules/orbit/constants'
import { leadDetail } from '@/modules/orbit/detail.queries'
import { daysAgo } from '@/modules/orbit/metrics'
import { nameOf, peopleIndex } from '@/modules/orbit/people'
import { canEditLead, loadLead } from '@/modules/orbit/scope'
import { isWarmSource } from '@/modules/orbit/settings'
import { leadSequence, sequenceOptions } from '@/modules/orbit/sequences/queries'
import { PersonalDataActions } from '@/components/settings/privacy'
import { KEPT_BY_LAW } from '@/modules/privacy/core'

export const metadata: Metadata = { title: 'Lead' }

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  const lead = await loadLead(ctx, id).catch((error: unknown) => (error instanceof NotFoundError ? null : Promise.reject(error)))
  if (!lead) notFound()
  const { cfg, people, choices } = await loadChoices(ctx)
  const index = peopleIndex(people)
  const detail = await leadDetail(ctx, lead, cfg, people)
  const today = todayIST()
  const stage = lead.stage as LeadStage
  const canEdit = canEditLead(ctx, lead)
  const [whatsappConnected, sequence, sequences] = await Promise.all([isWhatsAppConnected(ctx.orgId), leadSequence(ctx, String(lead._id)), sequenceOptions(ctx)])
  const canLog = canEdit && ctx.can('activities.write') && stage !== 'converted'
  const warm = isWarmSource(cfg, lead.source)
  const sectorLabel = labelFrom(cfg.sectors, lead.sector)
  const sourceLabel = labelFrom(cfg.sources, lead.source)
  const related = { leadId: String(lead._id) }
  const leadCtx = { id: String(lead._id), stage, source: lead.source }
  const closeReason = lead.closeReason ? `${labelFrom(cfg.lostReasons, lead.closeReason.code)}${lead.closeReason.note ? ` — ${lead.closeReason.note}` : ''}` : null
  const toMeeting = lead.contactedAt && lead.meetingBookedAt ? daysAgo(lead.contactedAt, lead.meetingBookedAt) : null

  return (
    <>
      <PageHeader
        title={lead.companyName}
        description={[lead.contactName, lead.designation].filter(Boolean).join(' · ') || undefined}
        icon={<Target />}
        back={{ href: '/app/orbit/leads', label: 'Leads' }}
        actions={
          <>
            {canLog ? <ScheduleDialog related={related} today={today} assignees={ctx.can('orbit.close') ? choices.owners : undefined} defaultAssigneeId={String(lead.ownerId)} trigger={<Button variant="secondary" icon={<CalendarPlus className="size-4" />}>Schedule follow-up</Button>} /> : null}
            {canLog ? <LogActivityDialog related={related} lead={leadCtx} today={today} trigger={<Button variant="primary" icon={<Plus className="size-4" />}>Log activity</Button>} /> : null}
            {ctx.can('org.manage') ? <PersonalDataActions subjectRef={{ kind: 'lead', leadId: String(lead._id) }} name={lead.contactName || lead.companyName} kept={KEPT_BY_LAW.lead} afterErase="/app/orbit/leads" size="md" /> : null}
            {ctx.can('orbit.settings') && stage !== 'converted' ? (
              <DeleteRecordButton kind="lead" id={String(lead._id)} title={`Delete '${lead.companyName}' and its ${detail.activityCount} activities?`} description="Reports will stop counting it. This cannot be undone." />
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-12 gap-3 xl:gap-[15px]">
        <div className="col-span-12 space-y-3 lg:col-span-8">
          <LeadStageCard
            lead={{
              id: String(lead._id), companyName: lead.companyName, contactName: lead.contactName ?? '', email: lead.email ?? '', valuePaise: lead.valuePaise ?? null, ownerId: String(lead.ownerId),
              stage, closeReason, convertedAt: lead.convertedAt ? lead.convertedAt.toISOString() : null,
              closedFrom: lead.meetingDoneAt ? 'meeting_done' : lead.meetingBookedAt ? 'meeting_booked' : lead.engagedAt ? 'engaged' : lead.contactedAt ? 'contacted' : 'new',
              client: detail.client ? { id: String(detail.client._id), name: detail.client.name } : null,
              deal: detail.deal ? { id: String(detail.deal._id), title: detail.deal.title } : null,
            }}
            evidence={detail.evidence}
            can={{ edit: canEdit && ctx.can('leads.write'), close: ctx.can('orbit.close') }}
            sourceIsWarm={warm}
            choices={choices}
            today={today}
          />
          <TableCard icon={<CalendarClock />} title="Upcoming" subtitle="Follow-ups scheduled on this lead" actions={canLog ? <ScheduleDialog related={related} today={today} assignees={ctx.can('orbit.close') ? choices.owners : undefined} defaultAssigneeId={String(lead.ownerId)} trigger={<Button size="sm" variant="ghost" icon={<Plus className="size-4" />}>Schedule</Button>} /> : null}>
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={detail.upcoming} today={today} canAct={canEdit} showRelated={false} empty={isOpenLead(stage) ? 'No next step. Leads without a next step quietly die.' : stage === 'converted' ? 'Converted. Follow-ups continue on the deal.' : 'This lead is closed. Nothing is planned.'} />
            </div>
          </TableCard>
          <RecordTimeline
              entries={detail.timeline}
              today={today}
              canDelete={ctx.can('orbit.settings')}
              empty={
                <div className="space-y-3">
                  <p>Nothing logged yet. This lead can&apos;t leave New until an outreach is recorded.</p>
                  {canLog ? <LogActivityDialog related={related} lead={leadCtx} today={today} trigger={<Button size="sm" variant="secondary" icon={<NotebookPen className="size-4" />}>Log the first outreach</Button>} /> : null}
                </div>
              }
            />
        </div>
        <div className="col-span-12 space-y-3 lg:col-span-4">
          <OverviewCard>
            <PanelHeader icon={<Target />} title="Lead" />
            <p className="mt-3 text-2xl font-semibold leading-[30px] tabular-nums text-white">{lead.valuePaise ? formatINR(lead.valuePaise, { decimals: 0 }) : <span className="text-base font-normal text-[#979797]">No value yet</span>}</p>
            <p className="text-xs text-[#979797]">Estimated deal value</p>
            <div className="mt-4 border-t border-line-soft pt-2">
              <Fact icon={<Layers strokeWidth={1.5} />} label="Stage"><LeadStageBadge stage={stage} /></Fact>
              <Fact icon={<ShoppingBag strokeWidth={1.5} />} label="Sector">{sectorLabel}</Fact>
              <Fact icon={<Waypoints strokeWidth={1.5} />} label="Source">{sourceLabel}{warm ? <span className="ml-1.5 text-[#979797]">· warm</span> : null}</Fact>
              <Fact icon={<Gauge strokeWidth={1.5} />} label="ICP fit">{lead.icpScore ? <IcpBars score={lead.icpScore} /> : null}</Fact>
              <Fact icon={<UserRound strokeWidth={1.5} />} label="Owner">{nameOf(index, lead.ownerId)}</Fact>
            </div>
          </OverviewCard>
          {sequence || (isOpenLead(stage) && canEdit && ctx.can('leads.write')) ? <LeadSequenceCard leadId={String(lead._id)} sequence={sequence} options={sequences} canEdit={canEdit && ctx.can('leads.write') && isOpenLead(stage)} /> : null}
          <SolidCard>
            <PanelHeader icon={<ListChecks />} title="Details" subtitle={canEdit && ctx.can('leads.write') && stage !== 'converted' ? 'Edit and save; the history keeps every change.' : undefined} className="mb-4" />
            <LeadDetailsForm
              values={{
                id: String(lead._id), companyName: lead.companyName, contactName: lead.contactName ?? '', designation: lead.designation ?? '', email: lead.email ?? '', phone: lead.phone ?? '',
                instagramHandle: lead.instagramHandle ?? '', linkedinUrl: lead.linkedinUrl ?? '', website: lead.website ?? '', sector: lead.sector, source: lead.source,
                icpScore: lead.icpScore ?? null, valuePaise: lead.valuePaise ?? null, ownerId: String(lead.ownerId), reviewerId: lead.reviewerId ? String(lead.reviewerId) : null,
                notes: lead.notes ?? '', ownerName: nameOf(index, lead.ownerId), reviewerName: nameOf(index, lead.reviewerId),
              }}
              choices={choices}
              sectorLabel={sectorLabel}
              sourceLabel={sourceLabel}
              canEdit={canEdit && ctx.can('leads.write') && stage !== 'converted'}
              whatsappSend={whatsappConnected && canEdit && ctx.can('activities.write') && stage !== 'converted'}
              canAssign={ctx.can('orbit.close')}
            />
          </SolidCard>
          <SolidCard>
            <PanelHeader icon={<Milestone />} title="Milestones" subtitle={toMeeting !== null ? `${toMeeting} days from first contact to meeting` : undefined} className="mb-3" />
            <Fact label="Created">{formatDateTime(lead.createdAt)}</Fact>
            <Fact label="First contacted">{lead.contactedAt ? formatDateTime(lead.contactedAt) : null}</Fact>
            <Fact label="First reply">{lead.engagedAt ? formatDateTime(lead.engagedAt) : null}</Fact>
            <Fact label="Meeting booked">{lead.meetingBookedAt ? formatDate(lead.meetingBookedAt) : null}</Fact>
            {lead.meetingAt ? <Fact label="Meeting on">{formatDateTime(lead.meetingAt)}</Fact> : null}
            <Fact label="Meeting done">{lead.meetingDoneAt ? formatDateTime(lead.meetingDoneAt) : null}</Fact>
            <Fact label="Converted">{lead.convertedAt ? formatDateTime(lead.convertedAt) : null}</Fact>
            <Fact label="Closed">{lead.closedAt ? formatDateTime(lead.closedAt) : null}</Fact>
          </SolidCard>
        </div>
      </div>
    </>
  )
}
