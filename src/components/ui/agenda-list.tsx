import Link from 'next/link'
import type { ReactNode } from 'react'
import { WEEKDAY_SHORT, formatDate, todayIST, weekday } from '@/lib/dates'
import type { AgendaDay } from '@/lib/agenda'
import { cn } from '@/lib/utils'

export type AgendaListProps<T> = {
  groups: AgendaDay<T>[]
  renderItem: (item: T) => ReactNode
  /** Key for each item inside its day. */
  itemKey: (item: T) => string
  /** Makes the day header a link (e.g. the leave calendar's day filter). */
  dayHref?: (date: string) => string
  /** Extra content on the right of a day header (an add button). */
  dayAction?: (date: string) => ReactNode
  /** Shown under a day with nothing on it (week views list every day). */
  emptyDayLabel?: string
  /** Shown when there are no days at all. */
  empty?: ReactNode
  selected?: string
  className?: string
}

/**
 * Phone view of a calendar: one block per day, a date header and the day's items as rows. Server-friendly.
 * Pair it with `groupByDay` and hide the grid below the same breakpoint.
 */
export function AgendaList<T>({ groups, renderItem, itemKey, dayHref, dayAction, emptyDayLabel = 'Nothing scheduled', empty, selected, className }: AgendaListProps<T>) {
  const today = todayIST()
  if (!groups.length) return <div className={className}>{empty ?? <p className="py-8 text-center text-[13px] text-fg-2">Nothing this month.</p>}</div>
  return (
    <ol className={cn('space-y-3', className)}>
      {groups.map(({ date, items }) => {
        const heading = (
          <>
            <span className={cn('flex h-[26px] min-w-[38px] items-center justify-center rounded-full px-2 text-[13px] font-semibold tabular-nums', date === today ? 'bg-chip-active text-white' : 'bg-control text-white/85')}>{Number(date.slice(8))}</span>
            <span className="text-[13px] text-[#929394]">
              {WEEKDAY_SHORT[weekday(date)]}, {formatDate(date, { short: true })}
              {date === today ? <span className="ml-1.5 text-white">Today</span> : null}
            </span>
          </>
        )
        return (
          <li key={date} className={cn('rounded-[10px] bg-white/[0.03] p-2.5', date === selected && 'ring-1 ring-white/45')}>
            <div className="flex min-h-9 items-center gap-2.5">
              {dayHref ? (
                <Link href={dayHref(date)} scroll={false} className="flex min-h-9 flex-1 items-center gap-2.5">
                  {heading}
                </Link>
              ) : (
                <div className="flex flex-1 items-center gap-2.5">{heading}</div>
              )}
              {dayAction?.(date)}
            </div>
            {items.length ? (
              <ul className="mt-1.5 space-y-1">
                {items.map((item) => (
                  <li key={itemKey(item)}>{renderItem(item)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 pl-1 text-xs text-fg-3">{emptyDayLabel}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
