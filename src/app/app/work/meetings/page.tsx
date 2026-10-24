import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { addDays, istInstant, startOfWeek, todayIST } from '@/lib/dates'
import { buildHref, first, parseListParams, type SearchParams } from '@/lib/list'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { MeetingCard } from '@/components/work/meetings/meeting-card'
import { MeetingFormDialog } from '@/components/work/meetings/meeting-form-dialog'
import { WeekCalendar } from '@/components/work/meetings/week-calendar'
import { PillLinks } from '@/components/work/teams/pill-links'
import { externalEvents, meetingCalendarFor } from '@/modules/work/meetings/google-sync'
import { MEETING_FILTERS, MEETINGS_PAGE_SIZE, listMeetings, weekMeetings, type MeetingFilter } from '@/modules/work/meetings/queries'
import { listPeople } from '@/modules/work/teams/people'
import { weekDays, weekLabel } from '@/modules/work/time/week'

export const metadata: Metadata = { title: 'Meetings' }
const BASE = '/app/work/meetings'
const WEEK_NAV = 'press inline-flex h-6 items-center justify-center rounded-full px-2 text-white transition-colors duration-150 hover:bg-white/[0.06]'
const FILTER_LABELS: Record<MeetingFilter, string> = { upcoming: 'Upcoming', past: 'Past', all: 'All' }

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work' })
  const p = parseListParams(sp, { pageSize: MEETINGS_PAGE_SIZE })
  const view = first(sp.view) === 'calendar' ? 'calendar' : 'list'
  const filter = (MEETING_FILTERS as readonly string[]).includes(p.get('filter') ?? '') ? (p.get('filter') as MeetingFilter) : 'upcoming'
  const mine = p.get('mine') === '1'
  const today = todayIST()
  const week = /^\d{4}-\d{2}-\d{2}$/.test(p.get('week') ?? '') ? startOfWeek(p.get('week') as string) : startOfWeek(today)
  const canSchedule = ctx.can('meetings.write')
  const people = canSchedule ? await listPeople(ctx) : []
  const googleCalendar = canSchedule ? await meetingCalendarFor(ctx, ctx.memberId, ctx.user.name) : null
  // ?schedule=1 reopens the form, e.g. after connecting Google Calendar from it; only the header's copy opens.
  const scheduleButton = (open: boolean) =>
    canSchedule && googleCalendar ? (
      <MeetingFormDialog
        trigger={<Button variant="primary" icon={<CalendarPlus className="size-4" />}>Schedule meeting</Button>}
        people={people.map((x) => ({ id: x.id, name: x.name, title: x.title }))}
        organizerId={String(ctx.memberId)}
        today={today}
        calendar={googleCalendar}
        returnTo={`${BASE}?schedule=1`}
        defaultOpen={open}
      />
    ) : null

  const list = view === 'list' ? await listMeetings(ctx, { filter, mine, q: p.q, page: p.page }) : null
  const [calendar, external] = view === 'calendar' ? await Promise.all([weekMeetings(ctx, week, mine), mine ? [] : externalEvents(ctx, istInstant(week), istInstant(addDays(week, 7)))]) : [null, []]
  const nextId = list && filter === 'upcoming' && p.page === 1 ? list.meetings.find((m) => m.status === 'scheduled')?.id : undefined

  return (
    <>
      <PageHeader title="Meetings" description="Agendas, attendees, notes and the action items that come out of them." breadcrumb={breadcrumbFor(BASE)} icon={<CalendarDays />} actions={<>{view === 'list' ? <SearchInput placeholder="Search meetings" /> : null}{scheduleButton(first(sp.schedule) === '1')}</>}>
        <div className="flex flex-wrap items-center gap-3">
          <PillLinks active={view} items={[{ key: 'list', label: 'List', href: buildHref(BASE, sp, { view: undefined, page: undefined }) }, { key: 'calendar', label: 'Calendar', href: buildHref(BASE, sp, { view: 'calendar', page: undefined }) }]} />
          {view === 'list' ? (
            <PillLinks active={filter} items={MEETING_FILTERS.map((f) => ({ key: f, label: f === 'upcoming' && list ? `${FILTER_LABELS[f]} · ${list.upcoming}` : FILTER_LABELS[f], href: buildHref(BASE, sp, { filter: f === 'upcoming' ? undefined : f, page: undefined }) }))} />
          ) : (
            <div className="flex items-center gap-2">
              <nav aria-label="Week" className="flex h-[33px] items-center gap-0.5 rounded-full bg-control p-[4.5px]">
                <Link href={buildHref(BASE, sp, { week: addDays(week, -7) })} className={WEEK_NAV} aria-label="Previous week"><ChevronLeft className="size-4" /></Link>
                <span className="px-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{weekLabel(week)}</span>
                <Link href={buildHref(BASE, sp, { week: addDays(week, 7) })} className={WEEK_NAV} aria-label="Next week"><ChevronRight className="size-4" /></Link>
              </nav>
              <Link href={buildHref(BASE, sp, { week: undefined })} className={buttonClass('secondary', 'sm')}>This week</Link>
            </div>
          )}
          <Link href={buildHref(BASE, sp, { mine: mine ? undefined : '1', page: undefined })} className={buttonClass(mine ? 'violet' : 'secondary', 'sm')} aria-pressed={mine}>
            Organised by me
          </Link>
        </div>
      </PageHeader>

      {calendar ? <WeekCalendar days={weekDays(week)} meetings={calendar} external={external} /> : null}
      {list ? (
        list.meetings.length === 0 ? (
          <div className="card-solid">
            <EmptyState
              icon={<CalendarDays />}
              title={p.q ? `No meetings match "${p.q}"` : filter === 'past' ? 'No past meetings' : 'No meetings scheduled'}
              description={filter === 'past' ? undefined : 'Schedule one with an agenda and the people who need to be there.'}
              action={filter !== 'past' ? scheduleButton(false) : undefined}
            />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {list.meetings.map((m) => <MeetingCard key={m.id} meeting={m} highlight={m.id === nextId} />)}
            </div>
            <Pagination page={p.page} pageSize={MEETINGS_PAGE_SIZE} total={list.total} basePath={BASE} params={sp} />
          </>
        )
      ) : null}
    </>
  )
}
