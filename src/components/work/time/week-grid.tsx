'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, Plus } from 'lucide-react'
import { Select, type SelectOption } from '@/components/ui/select'
import { WEEKDAY_SHORT, formatDate, weekday } from '@/lib/dates'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { setCell } from '@/modules/work/time/actions'
import { canEditDay, dayFormRows, dayTotal as totalOn, initialDay } from '@/modules/work/time/day-form'
import { formatHM, parseDuration } from '@/modules/work/time/format'
import { HEAD_ROW, PanelHeader, rowClass } from '../shared/table'

export type GridRow = { key: string; label: string; sub?: string; taskId?: string; days: Record<string, number>; total: number }

type Props = { days: string[]; workWeek: number[]; rows: GridRow[]; editable: boolean; options: SelectOption[]; today: string; expected: number }

/** Weekly timesheet on the "Assign to me" surface: rows are tasks/projects, columns Mon–Sun; cells save on blur. */
export function WeekGrid({ days, workWeek, rows: initial, editable, options, today, expected }: Props) {
  const router = useRouter()
  const [extra, setExtra] = useState<GridRow[]>([])
  const [adding, setAdding] = useState<string>()
  const [pending, startTransition] = useTransition()
  const rows = [...initial, ...extra.filter((r) => !initial.some((i) => i.key === r.key))]
  const dayTotal = (d: string) => totalOn(rows, d)
  const weekTotal = rows.reduce((s, r) => s + r.total, 0)

  const save = (row: GridRow, date: string, raw: string, input: HTMLInputElement) => {
    const minutes = parseDuration(raw)
    if (minutes === null) {
      toast.error('Use a time like 1:30, 1h 30m or 90m')
      input.value = formatHM(row.days[date] ?? 0, true)
      return
    }
    if (minutes === (row.days[date] ?? 0)) return
    startTransition(async () => {
      const result = await setCell({ target: row.key, date, duration: raw || '0' })
      if (!result.ok) {
        toast.error(result.error)
        input.value = formatHM(row.days[date] ?? 0, true)
        return
      }
      router.refresh()
    })
  }

  const addRow = (key: string) => {
    const opt = options.find((o) => o.value === key)
    if (!opt || rows.some((r) => r.key === key)) return setAdding(undefined)
    setExtra((prev) => [...prev, { key, label: opt.label, sub: opt.hint, days: {}, total: 0 }])
    setAdding(undefined)
  }

  return (
    <section aria-label="Timesheet" className="card-table overflow-hidden" aria-busy={pending || undefined}>
      <PanelHeader icon={<CalendarRange />} title="Timesheet" subtitle="Type a time like 1:30 or 90m; each cell saves when you leave it" className="px-[23px] pb-4 pt-[17px]" />
      <DayForm days={days} workWeek={workWeek} rows={rows} editable={editable} today={today} expected={expected} weekTotal={weekTotal} onSave={save} />
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className={HEAD_ROW}>
              <th scope="col" className="h-[42px] whitespace-nowrap pl-[23px] pr-3 text-left text-[13px] font-normal text-white">Task or project</th>
              {days.map((d) => (
                <th key={d} scope="col" className={cn('w-20 px-2 text-center text-[13px] font-normal', !workWeek.includes(weekday(d)) ? 'text-[#6F6D70]' : 'text-[#929394]')}>
                  {WEEKDAY_SHORT[weekday(d)]}
                  <div className={cn('mx-auto mt-0.5 flex h-[20px] w-fit items-center rounded-full px-2 text-xs tabular-nums', d === today ? 'bg-chip-active text-white' : 'text-white/80')}>{formatDate(d, { short: true })}</div>
                </th>
              ))}
              <th scope="col" className="w-24 whitespace-nowrap pl-3 pr-[23px] text-right text-[13px] font-normal text-white">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[13px] text-fg-2">No time logged this week. Start a timer, log time, or add a row.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.key} className={rowClass()}>
                <td className="max-w-[260px] py-2 pl-[23px] pr-3">
                  {row.taskId ? (
                    <Link href={`/app/work/tasks/${row.taskId}`} className="block truncate text-sm text-white transition-colors hover:text-blush">{row.label}</Link>
                  ) : (
                    <span className="block truncate text-sm text-white">{row.label}</span>
                  )}
                  {row.sub ? <span className="block truncate text-xs text-[#979797]">{row.sub}</span> : null}
                </td>
                {days.map((d) => {
                  const off = !workWeek.includes(weekday(d))
                  return (
                    <td key={d} className={cn('px-1.5 py-2 text-center', off && 'bg-black/[0.08]')}>
                      <input
                        key={`${row.key}-${d}-${row.days[d] ?? 0}`}
                        defaultValue={formatHM(row.days[d] ?? 0, true)}
                        disabled={!editable || (d > today && !(row.days[d] ?? 0))}
                        aria-label={`${row.label}, ${formatDate(d)}`}
                        placeholder="–"
                        onBlur={(e) => save(row, d, e.currentTarget.value.trim(), e.currentTarget)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className="h-8 w-16 rounded-full border border-white/[0.1] bg-white/[0.06] text-center text-[13px] tabular-nums text-white placeholder:text-fg-4 transition-[border-color,box-shadow] duration-150 hover:border-white/[0.28] focus:border-white/45 focus:shadow-[0_0_0_3px_rgba(187,98,165,0.25)] focus:outline-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent"
                      />
                    </td>
                  )
                })}
                <td className="py-2 pl-3 pr-[23px] text-right font-semibold tabular-nums text-white">{formatHM(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line text-white/80">
              <td className="whitespace-nowrap py-3 pl-[23px] pr-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-white">Day total</td>
              {days.map((d) => (
                <td key={d} className="px-2 py-3 text-center tabular-nums">{formatHM(dayTotal(d), true) || '–'}</td>
              ))}
              <td className="py-3 pl-3 pr-[23px] text-right tabular-nums">
                <span className="font-semibold text-white">{formatHM(weekTotal)}</span>
                <span className="block whitespace-nowrap text-xs text-[#979797]">of {formatHM(expected)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-[23px] py-3">
          <Plus className="size-4 text-icon-muted" aria-hidden />
          <Select size="sm" className="w-full sm:w-72" options={options.filter((o) => !rows.some((r) => r.key === o.value))} value={adding} onValueChange={addRow} placeholder="Add a task or project row" aria-label="Add row" />
          <span className="text-xs text-fg-2">New rows stay until you leave the page; type a time in a cell to save them.</span>
        </div>
      ) : null}
    </section>
  )
}

const cellInput =
  'rounded-full border border-white/[0.1] bg-white/[0.06] text-center tabular-nums text-white placeholder:text-fg-4 transition-[border-color,box-shadow] duration-150 hover:border-white/[0.28] focus:border-white/45 focus:shadow-[0_0_0_3px_rgba(187,98,165,0.25)] focus:outline-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent'

type DayFormProps = {
  days: string[]
  workWeek: number[]
  rows: GridRow[]
  editable: boolean
  today: string
  expected: number
  weekTotal: number
  onSave: (row: GridRow, date: string, raw: string, input: HTMLInputElement) => void
}

/** Below 768px: pick a day, then one row per task or project with a full-width time field. Same save as the grid. */
function DayForm({ days, workWeek, rows, editable, today, expected, weekTotal, onSave }: DayFormProps) {
  const [day, setDay] = useState(() => initialDay(days, today))
  const current = days.includes(day) ? day : initialDay(days, today)
  return (
    <div className="border-t border-line md:hidden">
      <div role="tablist" aria-label="Day" className="flex gap-1.5 overflow-x-auto px-4 py-3 scrollbar-none">
        {days.map((d) => {
          const total = totalOn(rows, d)
          const off = !workWeek.includes(weekday(d))
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === current}
              onClick={() => setDay(d)}
              className={cn('flex min-h-14 min-w-[52px] shrink-0 flex-col items-center justify-center rounded-[10px] px-2 text-xs transition-colors', d === current ? 'bg-chip-active text-white' : 'bg-control text-[#929394]', off && d !== current && 'opacity-60')}
            >
              <span>{WEEKDAY_SHORT[weekday(d)]}{d === today ? ' ·' : ''}</span>
              <span className="text-[13px] font-medium tabular-nums text-white">{Number(d.slice(8))}</span>
              <span className="tabular-nums">{formatHM(total, true) || '–'}</span>
            </button>
          )
        })}
      </div>
      <ul className="divide-y divide-white/[0.06] border-t border-line">
        {rows.length === 0 ? <li className="px-4 py-8 text-center text-[13px] text-fg-2">No time logged this week. Start a timer, log time, or add a row.</li> : null}
        {dayFormRows(rows, current).map((r, i) => {
          // dayFormRows keeps the grid's order, so the source row is at the same index.
          const row = rows[i]
          return (
            <li key={r.key} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                {r.taskId ? (
                  <Link href={`/app/work/tasks/${r.taskId}`} className="block truncate text-sm text-white">{r.label}</Link>
                ) : (
                  <span className="block truncate text-sm text-white">{r.label}</span>
                )}
                {r.sub ? <span className="block truncate text-xs text-[#979797]">{r.sub}</span> : null}
              </div>
              <input
                key={`${r.key}-${current}-${r.minutes}`}
                defaultValue={formatHM(r.minutes, true)}
                disabled={!canEditDay(editable, current, today, r.minutes)}
                aria-label={`${r.label}, ${formatDate(current)}`}
                placeholder="–"
                inputMode="text"
                enterKeyHint="done"
                onBlur={(e) => onSave(row, current, e.currentTarget.value.trim(), e.currentTarget)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className={cn(cellInput, 'h-11 w-24 text-base')}
              />
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px]">
        <span className="font-semibold uppercase tracking-[0.04em] text-white">{formatDate(current, { withWeekday: true })}</span>
        <span className="tabular-nums text-white/80">
          <span className="font-semibold text-white">{formatHM(totalOn(rows, current), true) || '0:00'}</span> · week {formatHM(weekTotal)} of {formatHM(expected)}
        </span>
      </div>
    </div>
  )
}
