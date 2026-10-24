import type { Metadata } from 'next'
import { CalendarDays, Users } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, monthOf, monthRange, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { MonthCalendar, type DayMark } from '@/components/ui/month-calendar'
import { PageHeader } from '@/components/ui/page-header'
import { Swatch } from '@/components/ui/swatch'
import { FilterChips } from '@/components/muster/ui/filter-chips'
import { ListCard, ListRow, ListRows } from '@/components/muster/ui/list-card'
import { MonthSwitcher } from '@/components/muster/attendance/month-switcher'
import { leaveCalendar } from '@/modules/muster/leave/queries'
import { peopleOptions } from '@/modules/muster/people/queries'
import { orgCalendar } from '@/modules/muster/settings/queries'

export const metadata: Metadata = { title: 'Leave calendar' }

const BASE = '/app/hr/leave/calendar'
/** The calendar's own fills, as round legend keys (My attendance). */
const LEGEND = [
  { label: 'Approved', color: '#5D4083' },
  { label: 'Pending', color: '#E4BD6D' },
  { label: 'Holiday', color: '#FAB5E8' },
]

export default async function LeaveCalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'leave.read' })
  const raw = first(sp.month)
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : monthOf(todayIST())
  const { start, end } = monthRange(month)
  const dept = first(sp.dept)
  const [entries, calendar, options] = await Promise.all([leaveCalendar(ctx, start, end, dept), orgCalendar(ctx, start, end), peopleOptions(ctx)])
  const dayRaw = first(sp.day)
  const selected = dayRaw && dayRaw >= start && dayRaw <= end ? dayRaw : null

  const byDay = new Map<string, typeof entries>()
  for (const e of entries) for (const d of e.dates) byDay.set(d, [...(byDay.get(d) ?? []), e])
  const marks: Record<string, DayMark> = {}
  for (const [d, list] of byDay) marks[d] = { tone: list.some((l) => l.status === 'approved') ? 'violet' : 'warning', label: `${list.length} off` }
  for (const [d, name] of calendar.holidayNames) marks[d] = { tone: 'pink', label: name }
  const offToday = selected ? (byDay.get(selected) ?? []) : []

  return (
    <>
      <PageHeader
        title="Leave calendar"
        description="Approved leave is solid, pending leave is amber. Pick a day to see who is off."
        breadcrumb={breadcrumbFor(BASE)}
        back={{ href: '/app/hr/leave', label: 'Leave' }}
        actions={<MonthSwitcher month={month} basePath={BASE} params={{ ...sp, day: undefined }} />}
      >
        <FilterChips label="Team" items={[{ key: 'all', href: buildHref(BASE, sp, { dept: undefined }), label: 'All teams', active: !dept }, ...options.departments.map((d) => ({ key: d.value, href: buildHref(BASE, sp, { dept: d.value }), label: d.label, active: dept === d.value }))]} />
      </PageHeader>
      <div className="grid grid-cols-12 gap-3">
        <Card variant="solid" className="col-span-12 rounded-[10px] xl:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5 text-sm text-white">
            {LEGEND.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-[5px]">
                <Swatch color={l.color} shape="round" />
                {l.label}
              </span>
            ))}
          </div>
          <MonthCalendar
            month={month}
            size="lg"
            marks={marks}
            selected={selected ?? undefined}
            dayHref={(d) => buildHref(BASE, sp, { day: d })}
            renderDay={(d) => {
              const list = byDay.get(d) ?? []
              return list.length ? (
                <span className="mt-1 hidden flex-col gap-0.5 lg:flex">
                  {list.slice(0, 2).map((l) => <span key={l.id} className={cn('truncate rounded-full px-2 py-px text-[11px] font-medium', l.status === 'approved' ? 'bg-[#5D4083] text-white' : 'bg-[#E4BD6D] text-[#3B2C0B]')}>{l.employee.split(' ')[0]}</span>)}
                  {list.length > 2 ? <span className="px-1 text-[11px] text-fg-2">+{list.length - 2} more</span> : null}
                </span>
              ) : null
            }}
            renderAgenda={(d) => {
              const list = byDay.get(d) ?? []
              return list.length ? (
                <span className="flex flex-wrap gap-1">
                  {list.map((l) => <span key={l.id} className={cn('rounded-full px-2 py-0.5 text-xs font-medium', l.status === 'approved' ? 'bg-[#5D4083] text-white' : 'bg-[#E4BD6D] text-[#3B2C0B]')}>{l.employee}{l.isHalfDay ? ' · ½' : ''}</span>)}
                </span>
              ) : null
            }}
          />
        </Card>
        <ListCard className="col-span-12 xl:col-span-4" label={selected ? formatDate(selected, { withWeekday: true }) : 'This month'} icon={selected ? <Users /> : <CalendarDays />} description={selected ? 'Who is off on this day' : 'Everyone with leave this month'}>
          {(selected ? offToday : entries).length ? (
            <ListRows>
              {(selected ? offToday : entries).map((l) => (
                <ListRow key={l.id} className="flex-nowrap">
                  <Avatar name={l.employee} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{l.employee}</span>
                    <span className="block truncate text-xs text-fg-2">{l.type}{l.isHalfDay ? ' · half day' : ''}{selected ? '' : ` · ${l.dates.length ? `${formatDate(l.dates[0], { short: true })}${l.dates.length > 1 ? ` – ${formatDate(l.dates[l.dates.length - 1], { short: true })}` : ''}` : ''}`}</span>
                  </span>
                  <Badge tone={l.status === 'approved' ? 'violet' : 'warning'}>{l.status === 'approved' ? 'Approved' : 'Pending'}</Badge>
                </ListRow>
              ))}
            </ListRows>
          ) : (
            <EmptyState compact icon={<CalendarDays />} title={selected ? (calendar.holidayNames.get(selected) ?? 'Nobody is off') : 'No leave this month'} description={selected ? undefined : 'Approved and pending leave shows here.'} />
          )}
        </ListCard>
      </div>
    </>
  )
}
