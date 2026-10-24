import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMonth, monthRange, todayIST, weekday } from '@/lib/dates'
import { groupByDay } from '@/lib/agenda'
import type { Tone } from '@/lib/status'
import { AgendaList } from './agenda-list'
import { TONE_DOT } from './badge'

export type DayMark = { tone: Tone; label?: string; /** Short marks under the day, one per event (max 3). */ dots?: Tone[] }

export type MonthCalendarProps = {
  /** 'YYYY-MM' */
  month: string
  /** Colour pills per day: { '2026-10-02': { tone: 'success', label: 'On time' } } */
  marks?: Record<string, DayMark>
  selected?: string
  /** Month switcher links. */
  prevHref?: string
  nextHref?: string
  /** Link for each day (server components). */
  dayHref?: (date: string) => string
  /** Extra content inside a day cell (larger calendars). */
  renderDay?: (date: string) => ReactNode
  /** Sunday-first (default, as the Figma) or Monday-first. */
  weekStartsOn?: 0 | 1
  size?: 'sm' | 'lg'
  className?: string
  title?: ReactNode
  /** Leave out the title row (the caller shows its own month switcher). */
  hideHeader?: boolean
  /** Large calendars only: rows under a day in the phone agenda (below 640px the grid becomes a list of marked days). */
  renderAgenda?: (date: string) => ReactNode
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Day-pill fills from the Figma attendance calendar; light fills take the Figma's slate numerals. */
const PILL: Record<Tone, { bg: string; ink: string }> = {
  success: { bg: 'var(--mint)', ink: '#4F5663' },
  warning: { bg: '#E4BD6D', ink: '#575D6A' },
  danger: { bg: 'var(--absent)', ink: '#FFFFFF' },
  info: { bg: '#6160FF', ink: '#FFFFFF' },
  pink: { bg: '#FAB5E8', ink: '#4A1D3F' },
  orange: { bg: '#E68763', ink: '#3D1709' },
  violet: { bg: '#5D4083', ink: '#FFFFFF' },
  orchid: { bg: '#8E4C80', ink: '#FFFFFF' },
  neutral: { bg: 'var(--control)', ink: 'var(--day-ink)' },
}

/** Label colours for large cells where the pill fill is too dark to read on its own 18% tint. */
const LABEL_INK: Partial<Record<Tone, string>> = { neutral: 'var(--text-3)', violet: '#B9A3DB', orchid: '#E0A6D2', info: '#9C9BFF' }

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Month grid with status-filled day pills, 34 x 22 (attendance, leave calendar, meetings). Server-friendly. */
export function MonthCalendar({ month, marks = {}, selected, prevHref, nextHref, dayHref, renderDay, weekStartsOn = 0, size = 'sm', className, title, hideHeader, renderAgenda }: MonthCalendarProps) {
  const { start, days } = monthRange(month)
  const lead = (weekday(start) - weekStartsOn + 7) % 7
  const today = todayIST()
  const names = [...DAY_NAMES.slice(weekStartsOn), ...DAY_NAMES.slice(0, weekStartsOn)]
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${pad2(i + 1)}`),
  ]
  const nav = 'inline-flex size-7 items-center justify-center rounded-full text-fg transition-colors hover:bg-white/[0.07]'
  const small = size === 'sm'

  return (
    <div className={className}>
      {!hideHeader ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-fg">{title ?? formatMonth(month)}</div>
          <div className="flex gap-1">
            {prevHref ? (
              <Link href={prevHref} className={nav} aria-label="Previous month" scroll={false}>
                <ChevronLeft className="size-4" />
              </Link>
            ) : null}
            {nextHref ? (
              <Link href={nextHref} className={nav} aria-label="Next month" scroll={false}>
                <ChevronRight className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {!small ? <MonthAgenda month={month} marks={marks} selected={selected} dayHref={dayHref} renderAgenda={renderAgenda} /> : null}
      <div className={cn('grid grid-cols-7 text-center', small ? 'justify-items-center gap-y-[13px]' : 'gap-1.5 max-sm:hidden')}>
        {names.map((n) => (
          <div key={n} className={cn('text-[13px] text-[#929394]', small ? 'leading-4' : 'pb-1 text-left')}>
            {n}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />
          const mark = marks[date]
          const fill = mark ? PILL[mark.tone] : null
          const style: CSSProperties = small
            ? { background: fill?.bg ?? 'var(--control)', color: fill?.ink ?? 'var(--day-ink)' }
            : { background: mark ? `color-mix(in srgb, ${PILL[mark.tone].bg} 18%, transparent)` : 'rgba(255,255,255,0.03)' }
          const cls = cn(
            'relative flex transition-[transform,box-shadow] duration-150',
            small ? 'h-[22px] w-[34px] items-center justify-center rounded-full text-[13px] font-medium tabular-nums hover:-translate-y-px' : 'min-h-24 flex-col rounded-[10px] p-2 text-left text-sm text-fg hover:bg-white/[0.06]',
            date === today && 'ring-1 ring-white/45',
            date === selected && 'ring-[1.5px] ring-white ring-offset-2 ring-offset-[#27272b]',
          )
          const inner = (
            <>
              <span className={cn(small ? '' : 'font-medium tabular-nums')}>{small ? pad2(Number(date.slice(8))) : Number(date.slice(8))}</span>
              {mark?.label && !small ? (
                <span className="mt-1 truncate text-xs font-medium" style={{ color: LABEL_INK[mark.tone] ?? PILL[mark.tone].bg }}>
                  {mark.label}
                </span>
              ) : null}
              {mark?.dots?.length ? (
                <span className={cn('flex gap-0.5', small ? 'absolute -bottom-1.5' : 'mt-auto')}>
                  {mark.dots.slice(0, 3).map((t, j) => (
                    <span key={j} className={cn('h-[2px] w-2 rounded-full', TONE_DOT[t])} />
                  ))}
                </span>
              ) : null}
              {renderDay?.(date)}
            </>
          )
          return dayHref ? (
            <Link key={date} href={dayHref(date)} className={cls} style={style} title={mark?.label} scroll={false}>
              {inner}
            </Link>
          ) : (
            <div key={date} className={cls} style={style} title={mark?.label}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Phone view of a large calendar: the month's marked days as a list, each with its label and the caller's rows. */
function MonthAgenda({ month, marks, selected, dayHref, renderAgenda }: Pick<MonthCalendarProps, 'month' | 'selected' | 'dayHref' | 'renderAgenda'> & { marks: Record<string, DayMark> }) {
  const { start, end } = monthRange(month)
  const groups = groupByDay(Object.entries(marks), ([date]) => date, { from: start, to: end })
  return (
    <AgendaList
      className="sm:hidden"
      groups={groups}
      itemKey={([date]) => date}
      dayHref={dayHref}
      selected={selected}
      renderItem={([date, mark]) => (
        <div className="space-y-1 pl-1">
          {mark.label ? (
            <span className="flex items-center gap-2 text-[13px] text-white">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOT[mark.tone])} />
              {mark.label}
            </span>
          ) : null}
          {renderAgenda?.(date)}
        </div>
      )}
    />
  )
}
