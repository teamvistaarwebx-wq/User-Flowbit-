import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Building2, CalendarClock, CalendarPlus, Contact, Handshake, History, Mail, NotebookPen, Phone, Star } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { ClientStatusPill } from '@/components/clients/client-status-pill'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { ContactActions } from '@/components/clients/contact-actions'
import { ActivityList } from '@/components/orbit/activity-row'
import { OrbitWhatsAppButton } from '@/components/orbit/whatsapp-button'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { LogActivityDialog } from '@/components/orbit/log-activity-dialog'
import { Fact, Note, PanelHeader, SolidCard, TableCard } from '@/components/orbit/parts'
import { ScheduleDialog } from '@/components/orbit/schedule-dialog'
import { DealStageBadge } from '@/components/orbit/stage-badge'
import { loadChoices } from '@/modules/orbit/choices'
import { contactDetail } from '@/modules/orbit/contacts.queries'
import { dealStageLabel } from '@/modules/orbit/dealStage'
import { whatsappHref } from '@/modules/orbit/normalize'
import { peopleIndex } from '@/modules/orbit/people'
import { PersonalDataActions } from '@/components/settings/privacy'
import { KEPT_BY_LAW } from '@/modules/privacy/core'

export const metadata: Metadata = { title: 'Contact' }

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  if (!ctx.can('clients.read')) redirect('/app/denied')
  const { people, choices } = await loadChoices(ctx)
  const detail = await contactDetail(ctx, id, peopleIndex(people))
  if (!detail) notFound()
  const { client, contact, deals } = detail
  const today = todayIST()
  const clientId = String(client._id)
  const canAct = ctx.can('activities.write')
  const canEdit = ctx.canAny('clients.write', 'contacts.write')
  const openDeal = deals.find((d) => d.status === 'open')
  const related = openDeal ? { dealId: String(openDeal._id), contactId: id } : { clientId, contactId: id }
  const wa = whatsappHref(contact.phone)
  const waConnected = await isWhatsAppConnected(ctx.orgId)
  const colorOf = (stage: string) => choices.dealStages.find((s) => s.key === stage)?.color ?? 'var(--orbit)'

  return (
    <>
      <PageHeader
        title={contact.name}
        description={contact.role || undefined}
        icon={<Contact />}
        back={{ href: '/app/orbit/contacts', label: 'Contacts' }}
        actions={
          <>
            {ctx.can('org.manage') ? <PersonalDataActions subjectRef={{ kind: 'contact', clientId, contactId: id }} name={contact.name} kept={KEPT_BY_LAW.contact} afterErase="/app/orbit/contacts" size="md" /> : null}
            {canEdit ? <ContactActions clientId={clientId} contact={{ id, name: contact.name, role: contact.role ?? '', email: contact.email ?? '', phone: contact.phone ?? '', primary: Boolean(contact.primary) }} afterDelete="/app/orbit/contacts" /> : null}
            {canAct ? <ScheduleDialog related={related} today={today} trigger={<Button variant="secondary" icon={<CalendarPlus className="size-4" />}>Schedule follow-up</Button>} /> : null}
            {canAct ? <LogActivityDialog related={related} defaultType="call" today={today} trigger={<Button variant="primary" icon={<NotebookPen className="size-4" />}>Log activity</Button>} /> : null}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {contact.primary ? <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-violet-2 px-3 text-xs font-medium text-white"><Star className="size-3.5" />Primary contact</span> : null}
          {contact.email ? <a href={`mailto:${contact.email}`} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.18] bg-control px-3 text-xs text-white transition-colors hover:border-white/30"><Mail className="size-3.5" />{contact.email}</a> : null}
          {contact.phone ? <a href={`tel:${contact.phone}`} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.18] bg-control px-3 text-xs text-white transition-colors hover:border-white/30"><Phone className="size-3.5" />{contact.phone}</a> : null}
          {wa ? <OrbitWhatsAppButton connected={waConnected && canAct} href={wa} target={{ clientId, contactId: id }} name={contact.name} /> : null}
        </div>
      </PageHeader>
      {openDeal && canAct ? <Note className="-mt-3 mb-4">New activity is logged on the open deal &ldquo;{openDeal.title}&rdquo;.</Note> : null}
      <div className="grid grid-cols-12 gap-3 xl:gap-[15px]">
        <div className="col-span-12 space-y-3 lg:col-span-8">
          <TableCard icon={<CalendarClock />} title="Upcoming" subtitle="Follow-ups scheduled with this contact">
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={detail.upcoming} today={today} canAct={canAct} empty="Nothing scheduled with this contact." />
            </div>
          </TableCard>
          <TableCard icon={<History />} title="Activity" subtitle="Everything logged with this contact, newest first">
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={detail.log} today={today} canAct={false} canDelete={ctx.can('orbit.settings')} empty="No activity with this contact yet." />
            </div>
          </TableCard>
        </div>
        <div className="col-span-12 space-y-3 lg:col-span-4">
          <SolidCard>
            <PanelHeader icon={<Building2 />} title="Client" actions={<Link href={`/app/clients/${clientId}`} className="text-xs font-medium text-white transition-opacity hover:opacity-75">Open client</Link>} className="mb-3" />
            <Fact label="Name"><Link className="transition-colors hover:text-blush" href={`/app/clients/${clientId}`}>{client.name}</Link></Fact>
            <Fact label="Status"><ClientStatusPill status={client.status} /></Fact>
            <Fact label="GSTIN">{client.gstin ? <span className="tabular-nums">{client.gstin}</span> : null}</Fact>
          </SolidCard>
          <SolidCard>
            <PanelHeader icon={<Handshake />} title="Deals" subtitle={deals.length ? `${deals.length} with this contact` : undefined} className="mb-3" />
            {deals.length === 0 ? (
              <p className="pb-1 text-[13px] text-fg-2">No deals with this contact.</p>
            ) : (
              <ul className="-mx-2">
                {deals.map((d) => (
                  <li key={String(d._id)}>
                    <Link href={`/app/orbit/deals/${d._id}`} className="flex items-center justify-between gap-3 rounded-[8px] px-2 py-2 transition-colors hover:bg-white/[0.05]">
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate text-sm text-white">{d.title}</span>
                        <DealStageBadge label={dealStageLabel(choices.dealStages, d.stage)} color={colorOf(d.stage)} status={d.status as 'open' | 'won' | 'lost'} />
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-white">{formatINR(d.valuePaise, { decimals: 0 })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SolidCard>
        </div>
      </div>
    </>
  )
}
