'use client'

import { CalendarDays, CalendarOff, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { addDays, formatDate, formatMonth, monthRange, startOfWeek } from '@/lib/dates'
import { groupByDay } from '@/lib/agenda'
import { cn } from '@/lib/utils'
import { AgendaList } from '@/components/ui/agenda-list'
import { Dialog } from '@/components/ui/dialog'
import { QuickAdd, type QuickAddContext } from './quick-add'
import { PanelHeader } from '../shared/table'
import { StatusIcon } from './task-bits'
import { useTaskData } from './task-data'
import type { TaskRow } from './types'
import { TaskOrder } from './panel/task-order'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PER_DAY = 3

/** First day a task occupies: its start date when it is on or before the due date, else the due date. */
const spanStart = (t: TaskRow) => (t.startDate && t.dueDate && t.startDate <= t.dueDate ? t.startDate : (t.dueDate as string))

/** Filled bars in the Figma status colours (the same fills as Home's pills); light fills take dark ink. */
const CHIP: Record<TaskRow['status'], string> = {
  todo: 'bg-[#3A3A3D] text-[#E6E5E6]',
  in_progress: 'bg-info text-white',
  in_review: 'bg-violet-2 text-white',
  blocked: 'bg-pink text-[#4A1D3F]',
  done: 'bg-success/70 text-white/90 line-through decoration-white/40',
}

const navLink = 'press inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[13px] text-white transition-colors duration-150 hover:bg-white/[0.06]'

export type TaskCalendarProps = {
  rows: TaskRow[]
  undated: TaskRow[]
  month: string
  prevHref: string
  nextHref: string
  todayHref: string
  quickAdd?: QuickAddContext
}

/** Month grid (Mon–Sun): each task spans start → due; tasks without a due date sit in a tray. Click a day to add. */
export function TaskCalendar({ rows, undated, month, prevHref, nextHref, todayHref, quickAdd }: TaskCalendarProps) {
  const data = useTaskData()
  const [addOn, setAddOn] = useState<string | null>(null)
  const { start, end } = monthRange(month)
  const first = startOfWeek(start)
  const last = addDays(startOfWeek(end), 6)
  const days: string[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d)
  const on = (day: string) => rows.filter((t) => t.dueDate && spanStart(t) <= day && t.dueDate >= day)

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
      <TaskOrder ids={[...rows, ...undated].map((t) => t.id)} />
      <section className="card-solid min-w-0 px-4 pb-4 pt-[17px] sm:px-[23px]">
        <PanelHeader
          icon={<CalendarDays />}
          title={formatMonth(month)}
          subtitle="Each task runs from its start date to its due date"
          className="mb-4"
          actions={
            <nav aria-label="Month" className="flex h-[33px] items-center gap-0.5 rounded-full bg-control p-[4.5px]">
              <Link href={prevHref} scroll={false} aria-label="Previous month" className={navLink}><ChevronLeft className="size-4" /></Link>
              <Link href={todayHref} scroll={false} className={cn(navLink, 'px-3')}>Today</Link>
              <Link href={nextHref} scroll={false} aria-label="Next month" className={navLink}><ChevronRight className="size-4" /></Link>
            </nav>
          }
        />
        {/* Phones: the month as a list of due days (a 7-column grid is about 48px a day at 375px). */}
        <AgendaList
          className="sm:hidden"
          groups={groupByDay(rows, (t) => t.dueDate, { from: start, to: end })}
          itemKey={(t) => t.id}
          empty={<p className="py-8 text-center text-[13px] text-fg-2">No tasks are due this month.</p>}
          dayAction={data.canWrite ? (day) => (
            <button type="button" onClick={() => setAddOn(day)} aria-label={`Add a task due ${formatDate(day)}`} className="hit-area relative rounded-full p-1.5 text-fg-3 transition-colors hover:bg-white/[0.08] hover:text-white">
              <Plus className="size-4" />
            </button>
          ) : undefined}
          renderItem={(t) => (
            <Link href={`/app/work/tasks/${t.id}`} scroll={false} className="flex min-h-10 items-center gap-2.5 rounded-lg px-1.5 text-[13px] text-white transition-colors hover:bg-white/[0.04]">
              <StatusIcon status={t.status} />
              <span className={cn('min-w-0 flex-1 truncate', t.status === 'done' && 'text-fg-2 line-through decoration-white/30')}>{t.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-fg-4">{t.key}</span>
            </Link>
          )}
        />
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[10px] bg-white/[0.07] max-sm:hidden">
          {DAY_NAMES.map((n) => (
            <div key={n} className="bg-[#232326] px-2 py-2 text-[13px] text-[#929394]">{n}</div>
          ))}
          {days.map((day) => {
            const tasks = on(day)
            const outside = day < start || day > end
            return (
              <div key={day} className={cn('group relative min-h-28 p-1.5', outside ? 'bg-[#1F1F21]' : 'bg-[#252528]')}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn('flex h-[22px] w-[34px] items-center justify-center rounded-full text-[13px] font-medium tabular-nums', day === data.today ? 'bg-chip-active text-white' : outside ? 'text-[#575D6A]' : 'text-white/85')}>{String(Number(day.slice(8))).padStart(2, '0')}</span>
                  {data.canWrite ? (
                    <button type="button" onClick={() => setAddOn(day)} aria-label={`Add a task due ${formatDate(day)}`} className="rounded-full p-1 text-fg-3 opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-white group-hover:opacity-100 touch:opacity-100 focus:opacity-100">
                      <Plus className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {tasks.slice(0, PER_DAY).map((t) => {
                    const startsHere = day === spanStart(t) || day === startOfWeek(day)
                    const endsHere = day === t.dueDate
                    return (
                      <Link key={t.id} href={`/app/work/tasks/${t.id}`} scroll={false} title={`${t.key} · ${t.title}`} className={cn('block truncate px-1.5 py-0.5 text-[11px] font-medium leading-4 transition-[filter] hover:brightness-110', CHIP[t.status], startsHere ? 'rounded-l-[6px]' : '-ml-1.5 pl-3', endsHere ? 'rounded-r-[6px]' : '-mr-1.5')}>
                        {t.title}
                      </Link>
                    )
                  })}
                  {tasks.length > PER_DAY ? <p className="px-1 text-[11px] text-fg-2">+{tasks.length - PER_DAY} more</p> : null}
                </div>
              </div>
            )
          })}
        </div>
      </section>
      <aside className="card-solid self-start px-4 pb-4 pt-[17px]">
        <PanelHeader icon={<CalendarOff />} title="No due date" subtitle={undated.length ? `${undated.length} open ${undated.length === 1 ? 'task' : 'tasks'}` : undefined} className="mb-3" />
        {undated.length === 0 ? <p className="text-[13px] text-fg-2">Every open task has a due date.</p> : null}
        <ul className="-mx-2 space-y-0.5">
          {undated.map((t) => (
            <li key={t.id}>
              <Link href={`/app/work/tasks/${t.id}`} scroll={false} className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] text-white transition-colors hover:bg-white/[0.04] hover:text-blush">
                <StatusIcon status={t.status} />
                <span className="truncate">{t.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <Dialog open={addOn !== null} onOpenChange={(open) => !open && setAddOn(null)} title="New task" description={addOn ? `Due ${formatDate(addOn, { withWeekday: true })}` : undefined} size="sm">
        {addOn ? <QuickAdd context={{ ...quickAdd, dueDate: addOn }} autoFocus placeholder="Task title, then Enter" onDone={() => setAddOn(null)} /> : null}
      </Dialog>
    </div>
  )
}
