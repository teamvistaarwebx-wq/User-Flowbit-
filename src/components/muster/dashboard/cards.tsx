import Link from 'next/link'
import { ArrowRight, Gift, CalendarCheck2, ClipboardList, DoorOpen, PieChart, UserPlus } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Donut } from '@/components/charts/donut'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { SegmentedBar } from '@/components/ui/progress'
import { Swatch } from '@/components/ui/swatch'
import type { Movement, Occasion, PersonToday, TodayBucket } from '@/modules/muster/dashboard/queries'
import type { Tone } from '@/lib/status'
import { ListCard, ListRow, ListRows } from '../ui/list-card'

/** Today's buckets in the Figma attendance palette (mint on time, amber late, pink absent), plus indigo, orange and lavender. */
const BUCKETS: { key: TodayBucket; label: string; tone: Tone; color: string }[] = [
  { key: 'in', label: 'In', tone: 'success', color: '#6DEDBF' },
  { key: 'remote', label: 'Remote', tone: 'info', color: '#6160FF' },
  { key: 'late', label: 'Late', tone: 'warning', color: '#E4BD6D' },
  { key: 'half', label: 'Half day', tone: 'orange', color: '#E68763' },
  { key: 'leave', label: 'On leave', tone: 'violet', color: '#9A80CC' },
  { key: 'absent', label: 'Absent', tone: 'danger', color: '#F5548C' },
  { key: 'notIn', label: 'Not in yet', tone: 'neutral', color: '#5A585B' },
]

/** Department split in the Figma's data colours (ring and legend keys), never the brand gradient. */
const PALETTE = ['#E68763', '#6160FF', '#FAB5E8', '#70F3C3', '#E4BD6D', '#08AD93', '#9A80CC', '#F5548C']

/** "View all projects" link style from Project overview: 12/500 white, quiet until hovered. */
const viewAll = 'inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-white/80 transition-colors hover:text-white'

const AVATARS_PER_ROW = 6

/**
 * Who is in today, as the dashboard's attendance card: the thick 48px segmented bar with ticks, then one row per
 * bucket (round legend key, count, the faces), divided by hairlines instead of boxed.
 */
export function TodayCard({ tiles, roll, date, className }: { tiles: Record<TodayBucket, number>; roll: PersonToday[]; date: string; className?: string }) {
  const working = roll.filter((p) => p.bucket !== 'off')
  const rows = BUCKETS.filter((b) => tiles[b.key] > 0)
  return (
    <Card className={cn('rounded-[14px] lit-edge-bright', className)}>
      <CardHeader
        label="Today"
        icon={<CalendarCheck2 />}
        description={`${tiles.in + tiles.remote + tiles.late + tiles.half} of ${working.length} working · ${formatDate(date, { withWeekday: true })}`}
        actions={
          <Link href="/app/hr/attendance" className={viewAll}>
            Open register <ArrowRight className="size-3" />
          </Link>
        }
      />
      <SegmentedBar showLegend={false} segments={BUCKETS.map((b) => ({ label: b.label, value: tiles[b.key], tone: b.tone, color: b.color }))} />
      {rows.length ? (
        <ul className={cn('mt-5 grid gap-x-8', rows.length > 2 && 'sm:grid-cols-2')}>
          {rows.map((b) => {
            const people = working.filter((p) => p.bucket === b.key)
            return (
              <li key={b.key} className="flex min-h-11 items-center gap-3 border-b border-white/[0.08] py-1.5">
                <Swatch color={b.color} shape="round" />
                <span className="min-w-0 truncate text-sm text-white">{b.label}</span>
                <span className="text-sm font-semibold tabular-nums text-white">{tiles[b.key]}</span>
                <span className="ml-auto flex items-center -space-x-1.5">
                  {people.slice(0, AVATARS_PER_ROW).map((p) => (
                    <Link key={p.id} href={`/app/hr/people/${p.id}?tab=attendance`} title={p.name} className="rounded-full transition-transform duration-150 hover:z-10 hover:-translate-y-px">
                      <Avatar name={p.name} size="xs" ring />
                    </Link>
                  ))}
                  {people.length > AVATARS_PER_ROW ? <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#313131] text-[9px] font-medium text-white ring-[1.5px] ring-white">+{people.length - AVATARS_PER_ROW}</span> : null}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-fg-2">Nobody is scheduled to work today.</p>
      )}
    </Card>
  )
}

type Approval = { label: string; count: number; href: string }

/** The queues this viewer can open, as an "Assign to me" list. */
export function ApprovalsCard({ items, className }: { items: Approval[]; className?: string }) {
  const total = items.reduce((s, i) => s + i.count, 0)
  return (
    <ListCard label="Waiting on you" icon={<ClipboardList />} description={total ? `${total} to look at` : 'All caught up'} className={className}>
      {items.length ? (
        <ListRows>
          {items.map((i) => (
            <ListRow key={i.label} className="p-0 sm:p-0">
              <Link href={i.href} className="group flex min-h-11 w-full items-center justify-between gap-3 px-5 sm:px-[23px]">
                <span className={i.count ? 'text-white' : 'text-fg-2'}>{i.label}</span>
                <span className="flex items-center gap-2.5">
                  {i.count ? <Badge tone="warning">{i.count}</Badge> : <span className="text-[13px] tabular-nums text-fg-3">0</span>}
                  <ArrowRight className="size-3.5 text-fg-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-white" />
                </span>
              </Link>
            </ListRow>
          ))}
        </ListRows>
      ) : (
        <p className="px-5 py-6 text-sm text-fg-2 sm:px-[23px]">You have no approval queues.</p>
      )}
    </ListCard>
  )
}

export function TeamsCard({ data, headcount, className }: { data: { label: string; value: number }[]; headcount: number; className?: string }) {
  return (
    <Card variant="solid" className={cn('rounded-[10px]', className)}>
      <CardHeader label="Teams" icon={<PieChart />} description="Headcount by department" />
      {data.length ? <Donut data={data.map((d, i) => ({ ...d, color: PALETTE[i % PALETTE.length] }))} centerValue={String(headcount)} centerLabel="people" size={150} /> : <p className="text-sm text-fg-2">Assign departments to see the split.</p>}
    </Card>
  )
}

export function OccasionsCard({ items, today, className }: { items: Occasion[]; today: string; className?: string }) {
  return (
    <ListCard label="Birthdays & anniversaries" icon={<Gift />} description="Next 30 days" className={className}>
      {items.length ? (
        <ListRows>
          {items.slice(0, 7).map((o) => (
            <ListRow key={`${o.id}-${o.kind}`} className="flex-nowrap">
              <Avatar name={o.name} size="xs" ring />
              <Link href={`/app/hr/people/${o.id}`} className="min-w-0 flex-1 truncate text-white transition-colors hover:text-blush">
                {o.name}
              </Link>
              <span className="shrink-0 text-[13px] text-fg-2">{o.kind === 'birthday' ? 'Birthday' : `${o.years} year${o.years === 1 ? '' : 's'}`}</span>
              <span className={cn('w-14 shrink-0 text-right text-[13px] tabular-nums', o.date === today ? 'font-medium text-name' : 'text-[#979797]')}>{o.date === today ? 'Today' : formatDate(o.date, { short: true })}</span>
            </ListRow>
          ))}
        </ListRows>
      ) : (
        <p className="px-5 py-6 text-sm text-fg-2 sm:px-[23px]">Nothing in the next 30 days.</p>
      )}
    </ListCard>
  )
}

const MOVE: Record<Movement['kind'], { label: string; tone: Tone }> = { joining: { label: 'Joining', tone: 'info' }, joined: { label: 'Joined', tone: 'success' }, leaving: { label: 'Leaving', tone: 'warning' }, left: { label: 'Left', tone: 'neutral' } }

export function MovementsCard({ items, className }: { items: Movement[]; className?: string }) {
  return (
    <ListCard label="Joiners & exits" icon={<UserPlus />} description="30 days either side of today" className={className}>
      {items.length ? (
        <ListRows className="grid xl:grid-cols-2">
          {items.map((m) => (
            <ListRow key={`${m.id}-${m.kind}`} className="flex-nowrap">
              {m.kind === 'leaving' || m.kind === 'left' ? <DoorOpen className="size-4 shrink-0 text-icon-muted" /> : <UserPlus className="size-4 shrink-0 text-icon-muted" />}
              <span className="min-w-0 flex-1">
                <Link href={`/app/hr/people/${m.id}`} className="block truncate text-white transition-colors hover:text-blush">
                  {m.name}
                </Link>
                <span className="block truncate text-xs text-fg-2">
                  {m.designation ?? 'No designation'} · {formatDate(m.date)}
                </span>
              </span>
              <Badge tone={MOVE[m.kind].tone}>{MOVE[m.kind].label}</Badge>
            </ListRow>
          ))}
        </ListRows>
      ) : (
        <p className="px-5 py-6 text-sm text-fg-2 sm:px-[23px]">No one joined or left recently, and nobody is due to.</p>
      )}
    </ListCard>
  )
}
