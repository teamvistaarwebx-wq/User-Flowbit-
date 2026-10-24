import type { Metadata } from 'next'
import { after } from 'next/server'
import { AlarmClock, CalendarCheck, CalendarDays, CalendarPlus, History, NotebookPen, PhoneCall } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { addDays, formatDate, todayIST } from '@/lib/dates'
import { buildHref, type SearchParams } from '@/lib/list'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { DateInput } from '@/components/ui/input'
import { LinkTabs } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { ActivityList } from '@/components/orbit/activity-row'
import { LogActivityDialog } from '@/components/orbit/log-activity-dialog'
import { SegmentLinks, TableCard } from '@/components/orbit/parts'
import { ScheduleDialog } from '@/components/orbit/schedule-dialog'
import { UrlSelect } from '@/components/orbit/url-select'
import { TYPE_FILTERS, listActivities, parseActivityQuery } from '@/modules/orbit/activities.queries'
import { PAGE_SIZE } from '@/modules/orbit/constants'
import { orbitPeople, ownerOptions, peopleIndex } from '@/modules/orbit/people'
import type { ActivityItem } from '@/modules/orbit/record-types'
import { remindDueFollowUps } from '@/modules/orbit/reminders'

export const metadata: Metadata = { title: 'Activities' }
const BASE = '/app/orbit/activities'

/** Upcoming items grouped by date ("Tomorrow", "Mon, 5 Oct"). */
function groupByDate(items: ActivityItem[], today: string) {
  const groups = new Map<string, ActivityItem[]>()
  for (const item of items) groups.set(item.dueDate ?? '', [...(groups.get(item.dueDate ?? '') ?? []), item])
  return [...groups.entries()].map(([date, list]) => ({ date, label: date === addDays(today, 1) ? 'Tomorrow' : formatDate(date, { withWeekday: true, short: true }), list }))
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  const today = todayIST()
  const q = parseActivityQuery(sp, today)
  after(() => remindDueFollowUps(ctx))
  const people = await orbitPeople(ctx)
  const data = await listActivities(ctx, q, peopleIndex(people))
  const canAct = ctx.can('activities.write')
  const canDelete = ctx.can('orbit.settings')
  const tab = (t: string) => (t === 'today' ? BASE : `${BASE}?tab=${t}`)
  const typeLink = (value?: string) => buildHref(BASE, sp, { type: value, page: undefined })
  const activeType = TYPE_FILTERS.find((t) => t.type === q.type)?.value

  return (
    <>
      <PageHeader
        title="Activities"
        description="Calls, emails, meetings, notes and follow-ups across leads, deals and clients."
        breadcrumb={breadcrumbFor(BASE)}
        icon={<PhoneCall />}
        actions={
          canAct ? (
            <>
              <ScheduleDialog today={today} assignees={ctx.can('orbit.close') ? ownerOptions(people) : undefined} trigger={<Button variant="secondary" icon={<CalendarPlus className="size-4" />}>Schedule</Button>} />
              <LogActivityDialog today={today} trigger={<Button variant="primary" icon={<NotebookPen className="size-4" />}>Log activity</Button>} />
            </>
          ) : null
        }
      >
        <div className="space-y-3">
          <LinkTabs
            tabs={[
              { href: tab('today'), label: 'Today', count: data.counts.today },
              { href: tab('overdue'), label: 'Overdue', count: data.counts.overdue },
              { href: tab('upcoming'), label: 'Upcoming', count: data.counts.upcoming },
              { href: tab('done'), label: 'Done' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SegmentLinks label="Activity type" items={[{ href: typeLink(undefined), label: 'All types', active: !activeType }, ...TYPE_FILTERS.map((t) => ({ href: typeLink(t.value), label: t.label, active: activeType === t.value }))]} />
            <span className="flex-1" />
            <UrlSelect param="related" label="Related to" allLabel="Any record" options={[{ value: 'lead', label: 'Leads' }, { value: 'deal', label: 'Deals' }, { value: 'client', label: 'Clients' }]} />
            {ctx.can('orbit.view_all') ? <UrlSelect param="owner" label="Owner" allLabel="Whole team" options={[{ value: 'me', label: 'Mine' }, ...people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]} /> : null}
          </div>
        </div>
      </PageHeader>

      {q.tab === 'today' ? (
        <div className="grid gap-3 xl:grid-cols-[732fr_543fr] xl:gap-[15px]">
          <TableCard icon={<CalendarCheck />} title="Due today" subtitle="Complete, reschedule or cancel each one">
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={data.items} today={today} canAct={canAct} canDelete={canDelete} empty="Nothing due today." />
            </div>
          </TableCard>
          <TableCard icon={<NotebookPen />} title="Done today" subtitle="What was logged since this morning">
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={data.doneToday} today={today} canAct={false} canDelete={canDelete} empty="Nothing logged yet today." />
            </div>
          </TableCard>
        </div>
      ) : null}
      {q.tab === 'overdue' ? (
        <TableCard icon={<AlarmClock />} title="Overdue" subtitle="Follow-ups past their date, oldest first">
          <div className="border-t border-line px-[11px] py-2">
            <ActivityList items={data.items} today={today} canAct={canAct} canDelete={canDelete} empty="Nothing overdue. Clean slate." />
          </div>
        </TableCard>
      ) : null}
      {q.tab === 'upcoming' ? (
        data.items.length ? (
          <div className="space-y-3">
            {groupByDate(data.items, today).map((g) => (
              <TableCard key={g.date} icon={<CalendarDays />} title={g.label} subtitle={`${g.list.length} scheduled`}>
                <div className="border-t border-line px-[11px] py-2">
                  <ActivityList items={g.list} today={today} canAct={canAct} canDelete={canDelete} empty="" />
                </div>
              </TableCard>
            ))}
          </div>
        ) : (
          <TableCard icon={<CalendarDays />} title="Upcoming">
            <div className="flex flex-col items-center gap-3 border-t border-line px-[23px] py-10 text-center">
              <p className="text-sm text-white">No follow-ups scheduled.</p>
              <p className="text-[13px] text-fg-2">Every open lead needs a next step.</p>
              <Button variant="secondary" href="/app/orbit/leads?due=none">See leads without a next step</Button>
            </div>
          </TableCard>
        )
      ) : null}
      {q.tab === 'done' ? (
        <TableCard
          icon={<History />}
          title="Logged"
          subtitle="Done and cancelled activity in the period"
          actions={
            <form className="flex flex-wrap items-center gap-2" action={BASE}>
              <input type="hidden" name="tab" value="done" />
              {q.type ? <input type="hidden" name="type" value={activeType} /> : null}
              <DateInput name="from" defaultValue={q.from} max={today} inputSize="sm" aria-label="From" className="w-[140px]" />
              <span className="text-[13px] text-[#979797]">to</span>
              <DateInput name="to" defaultValue={q.to} max={today} inputSize="sm" aria-label="To" className="w-[140px]" />
              <button type="submit" className={buttonClass('secondary', 'sm')}>Apply</button>
            </form>
          }
        >
          <div className="border-t border-line px-[11px] py-2">
            <ActivityList items={data.items} today={today} canAct={false} canDelete={canDelete} empty="Nothing logged in this period." />
          </div>
        </TableCard>
      ) : null}
      {q.tab === 'done' ? <Pagination page={q.page} pageSize={PAGE_SIZE} total={data.total} basePath={BASE} params={sp} /> : null}
    </>
  )
}
