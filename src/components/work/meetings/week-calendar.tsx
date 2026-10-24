import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { WEEKDAY_SHORT, formatDate, formatTime, isoDateIST, todayIST, weekday } from '@/lib/dates'
import { groupByDay } from '@/lib/agenda'
import { cn } from '@/lib/utils'
import { AgendaList } from '@/components/ui/agenda-list'
import type { MeetingCardData } from '@/modules/work/meetings/queries'
import type { ExternalEvent } from '@/modules/google/event-body'
import { DAY_END_MIN, DAY_START_MIN, blockPosition } from '@/modules/work/meetings/schedule'

const HOURS = Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => DAY_START_MIN / 60 + i)
const label = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`

const EXTERNAL_CLASS = 'border border-dashed border-white/25 bg-white/[0.04] text-white/80'
const externalTitle = (e: ExternalEvent) => `${e.title}, ${formatTime(e.startAt)} – ${formatTime(e.endAt)} (Google Calendar, read-only)`

/** One read-only Google Calendar event: opens in Google when it has a link. */
function ExternalBlock({ event, className, style, children }: { event: ExternalEvent; className: string; style?: CSSProperties; children: ReactNode }) {
  const cls = cn(EXTERNAL_CLASS, className)
  return event.href ? (
    <a href={event.href} target="_blank" rel="noopener noreferrer" className={cls} style={style} title={externalTitle(event)}>{children}</a>
  ) : (
    <div className={cls} style={style} title={externalTitle(event)}>{children}</div>
  )
}

/**
 * Seven day columns with meetings placed by IST time (8 am – 9 pm), on the opaque table surface with hairline columns.
 * `external`: the viewer's own Google Calendar events, shown read-only with a dashed outline.
 */
export function WeekCalendar({ days, meetings, external = [] }: { days: string[]; meetings: MeetingCardData[]; external?: ExternalEvent[] }) {
  return (
    <>
      <WeekAgenda days={days} meetings={meetings} external={external} />
      <WeekGrid days={days} meetings={meetings} external={external} />
    </>
  )
}

type AgendaItem = { key: string; startAt: string; meeting?: MeetingCardData; event?: ExternalEvent }

/** Below 768px: the week as a day-by-day list, every day shown, meetings in start order. */
function WeekAgenda({ days, meetings, external }: { days: string[]; meetings: MeetingCardData[]; external: ExternalEvent[] }) {
  const items: AgendaItem[] = [...meetings.map((m) => ({ key: m.id, startAt: m.startAt, meeting: m })), ...external.map((e) => ({ key: `g-${e.id}`, startAt: e.startAt, event: e }))]
  const sorted = items.sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0))
  return (
    <div className="card-solid p-3 md:hidden">
      <AgendaList
        groups={groupByDay(sorted, (m) => isoDateIST(new Date(m.startAt)), { days })}
        itemKey={(m) => m.key}
        emptyDayLabel="No meetings"
        renderItem={({ meeting: m, event }) => event ? (
          <ExternalBlock event={event} className="flex min-h-11 items-center gap-3 rounded-[8px] px-2.5 py-1.5 text-[13px]">
            <span className="w-[68px] shrink-0 tabular-nums opacity-80">{formatTime(event.startAt)}</span>
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
          </ExternalBlock>
        ) : m ? (
          <Link
            href={`/app/work/meetings/${m.id}`}
            className={cn('flex min-h-11 items-center gap-3 rounded-[8px] px-2.5 py-1.5 text-[13px]', m.status === 'cancelled' ? 'bg-control text-fg-3 line-through' : 'bg-[#5D4083] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]')}
          >
            <span className="w-[68px] shrink-0 tabular-nums opacity-80">{formatTime(m.startAt)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{m.title}</span>
          </Link>
        ) : null}
      />
    </div>
  )
}

/** 768px and up: seven time columns. */
function WeekGrid({ days, meetings, external }: { days: string[]; meetings: MeetingCardData[]; external: ExternalEvent[] }) {
  const today = todayIST()
  return (
    <div className="card-table overflow-x-auto max-md:hidden">
      <div className="grid min-w-[820px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <div className="border-b border-line" />
        {days.map((d) => (
          <div key={d} className={cn('flex flex-col items-center gap-1 border-b border-l border-line px-2 py-3 text-center', d === today && 'bg-white/[0.03]')}>
            <div className="text-[13px] text-[#929394]">{WEEKDAY_SHORT[weekday(d)]}</div>
            <div className={cn('flex h-[22px] items-center rounded-full px-2.5 text-[13px] font-medium tabular-nums', d === today ? 'bg-chip-active text-white' : 'text-white')}>{formatDate(d, { short: true })}</div>
          </div>
        ))}
        <div className="relative h-[620px]">
          {HOURS.map((h, i) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-[#797779]" style={{ top: `${(i / (HOURS.length - 1)) * 100}%` }}>
              {label(h)}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className={cn('relative h-[620px] border-l border-white/[0.08]', d === today && 'bg-white/[0.03]')}>
            {HOURS.map((h, i) => (
               <div key={h} className="absolute inset-x-0 border-t border-white/[0.05]" style={{ top: `${(i / (HOURS.length - 1)) * 100}%` }} />
            ))}
            {meetings
              .filter((m) => isoDateIST(new Date(m.startAt)) === d)
              .map((m) => {
                const pos = blockPosition(m.startAt, m.endAt)
                return (
                  <Link
                    key={m.id}
                    href={`/app/work/meetings/${m.id}`}
                    className={cn(
                      'lift absolute inset-x-1 overflow-hidden rounded-[8px] px-2 py-1 text-xs leading-tight',
                      m.status === 'cancelled' ? 'bg-control text-fg-3 line-through' : 'bg-[#5D4083] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-[#674a8e]',
                    )}
                    style={{ top: `${pos.top}%`, height: `${pos.height}%` }}
                    title={`${m.title}, ${formatTime(m.startAt)} – ${formatTime(m.endAt)}`}
                  >
                    <span className="block truncate font-semibold">{m.title}</span>
                    <span className="block truncate opacity-80">{formatTime(m.startAt)}</span>
                  </Link>
                )
              })}
            {external
              .filter((e) => isoDateIST(new Date(e.startAt)) === d)
              .map((e) => {
                const pos = blockPosition(e.startAt, e.endAt)
                return (
                  <ExternalBlock key={e.id} event={e} className="absolute inset-x-1 overflow-hidden rounded-[8px] px-2 py-1 text-xs leading-tight" style={{ top: `${pos.top}%`, height: `${pos.height}%` }}>
                    <span className="block truncate">{e.title}</span>
                    <span className="block truncate opacity-70">{formatTime(e.startAt)} · Google</span>
                  </ExternalBlock>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}
