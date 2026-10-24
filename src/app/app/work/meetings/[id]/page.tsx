import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { CalendarDays, ClipboardList, Clock3, Crown, Link2, ListChecks, MapPin, NotebookPen, UsersRound, Video } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatTime, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { statusLabel } from '@/lib/status'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Badge, StatusPill } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ActionItems } from '@/components/work/meetings/action-items'
import { MeetingActions } from '@/components/work/meetings/meeting-actions'
import { NotesEditor } from '@/components/work/meetings/notes-editor'
import { RsvpButtons } from '@/components/work/meetings/rsvp-buttons'
import { meetingCalendarFor } from '@/modules/work/meetings/google-sync'
import { meetingDetail } from '@/modules/work/meetings/queries'
import { meetingFormValues, rsvpSummary } from '@/modules/work/meetings/schedule'
import { listPeople } from '@/modules/work/teams/people'
import { MeetingAiCard } from '@/components/work/meetings/meeting-ai-card'
import { meetingAiView } from '@/modules/work/meetings/ai/view'

export const metadata: Metadata = { title: 'Meeting' }
const RSVP_TONE = { accepted: 'success', tentative: 'warning', declined: 'danger', pending: 'neutral' } as const
const RSVP_LABEL: Record<string, string> = { accepted: 'Going', tentative: 'Maybe', declined: 'Declined', pending: 'No reply' }

/** A fact row from Home's Project overview: icon + label, the value right-aligned. */
function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-3">
      <span className="flex shrink-0 items-center gap-2 text-sm text-white [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm text-white">{children}</span>
    </div>
  )
}

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work' })
  if (!isValidObjectId(id)) notFound()
  const meeting = await meetingDetail(ctx, id)
  if (!meeting) notFound()
  const people = (await listPeople(ctx)).map((p) => ({ id: p.id, name: p.name, title: p.title }))
  const cancelled = meeting.status === 'cancelled'
  const past = new Date(meeting.endAt).getTime() < Date.now()
  const canEdit = !cancelled && (meeting.isOrganizer || ctx.can('tasks.manage'))
  const editable = meeting.isParticipant && !cancelled
  const aiView = ctx.hasFeature('meetings_ai') && meeting.isParticipant ? await meetingAiView(ctx, meeting.id) : null
  // The Meet link comes from the organiser's calendar, whoever edits.
  const calendar = canEdit ? await meetingCalendarFor(ctx, meeting.organizerId, meeting.organizer) : null

  return (
    <>
      <PageHeader
        title={<span className={cancelled ? 'line-through decoration-fg-3' : undefined}>{meeting.title}</span>}
        description={`${formatDate(meeting.startAt, { withWeekday: true })}, ${formatTime(meeting.startAt)} – ${formatTime(meeting.endAt)} · organised by ${meeting.organizer}`}
        back={{ href: '/app/work/meetings', label: 'Meetings' }}
        icon={<CalendarDays />}
        actions={
          <>
            {cancelled ? <StatusPill status="cancelled" /> : null}
            {!cancelled && !past && meeting.link ? (
              <a href={meeting.link} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'md')}>
                <Video className="size-4" /> Join
              </a>
            ) : null}
            {canEdit && calendar ? (
              <MeetingActions
                meeting={{ id: meeting.id, title: meeting.title, agenda: meeting.agenda, ...meetingFormValues(meeting.startAt, meeting.endAt), location: meeting.location ?? '', link: meeting.link ?? '', attendeeIds: meeting.attendees.map((a) => a.id) }}
                people={people}
                organizerId={meeting.organizerId}
                today={todayIST()}
                calendar={calendar}
                editOpen={first(sp.edit) === '1'}
              />
            ) : null}
          </>
        }
      />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 space-y-3 lg:col-span-8">
          {/* Agenda and the facts side by side, as Home's Project overview: glass, a hairline between them. */}
          <section className="glass lit-edge-bright @container rounded-[14px] bg-white/[0.11] px-[15px] pb-5 pt-[17px] sm:px-5">
            <div className="grid gap-6 @min-[640px]:grid-cols-[minmax(0,1fr)_1px_minmax(0,0.9fr)] @min-[640px]:gap-x-[19px]">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white"><ClipboardList className="size-4" />Agenda</h2>
                {meeting.agenda ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/85">{meeting.agenda}</p> : <p className="mt-3 text-[13px] text-fg-2">No agenda was added.</p>}
              </div>
              <span aria-hidden className="hidden w-px self-stretch bg-line-soft @min-[640px]:block" />
              <div className="min-w-0 space-y-[3px]">
                <Fact icon={<CalendarDays />} label="Date">{formatDate(meeting.startAt, { withWeekday: true })}</Fact>
                <Fact icon={<Clock3 />} label="Time"><span className="tabular-nums">{formatTime(meeting.startAt)} – {formatTime(meeting.endAt)}</span></Fact>
                <Fact icon={<Crown />} label="Organiser">{meeting.organizer}</Fact>
                {meeting.location ? <Fact icon={<MapPin />} label="Where">{meeting.location}</Fact> : null}
                {meeting.link ? <Fact icon={<Link2 />} label="Link"><a href={meeting.link} target="_blank" rel="noopener noreferrer" className="text-link transition-opacity hover:opacity-80">Open link</a></Fact> : null}
                {meeting.google ? <Fact icon={<CalendarDays />} label="Google Calendar"><span className={meeting.google.synced ? '' : 'text-warning'} title={meeting.google.error}>{meeting.google.synced ? 'On the organiser’s calendar' : 'Not synced'}</span></Fact> : null}
                <Fact icon={<UsersRound />} label="Attendees"><AvatarStack size="xs" max={4} people={meeting.attendees.map((a) => ({ name: a.name }))} className="justify-end" /></Fact>
              </div>
            </div>
          </section>
          <Card variant="solid">
            <CardHeader label="Notes" icon={<NotebookPen />} />
            <NotesEditor meetingId={meeting.id} initial={meeting.notes} updated={meeting.notesUpdated} editable={editable} />
          </Card>
          <Card variant="solid">
            <CardHeader label="Action items" icon={<ListChecks />} description="Each item can become a task with its assignee and due date." />
            <ActionItems meetingId={meeting.id} items={meeting.actionItems} people={people} editable={editable} canCreateTasks={ctx.can('tasks.write')} />
          </Card>
        </div>
        <div className="col-span-12 space-y-3 lg:col-span-4">
          {aiView ? <MeetingAiCard meetingId={meeting.id} view={aiView} editable={editable} /> : null}
          {meeting.myRsvp && !meeting.isOrganizer && !cancelled && !past ? (
            <Card variant="solid">
              <CardHeader label="Your answer" icon={<CalendarDays />} />
              <RsvpButtons meetingId={meeting.id} value={meeting.myRsvp} size="md" />
            </Card>
          ) : null}
          <Card variant="solid">
            <CardHeader label="Attendees" icon={<UsersRound />} description={rsvpSummary(meeting.attendees)} />
            <ul className="-mx-2">
              {meeting.attendees.map((a) => (
                <li key={a.id} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-white/[0.04]">
                  <Avatar name={a.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{a.name}</span>
                  <Badge tone={RSVP_TONE[a.rsvp as keyof typeof RSVP_TONE] ?? 'neutral'}>
                    {RSVP_LABEL[a.rsvp] ?? statusLabel(a.rsvp)}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
