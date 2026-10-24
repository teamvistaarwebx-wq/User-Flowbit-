'use client'

import Link from 'next/link'
import { useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { formatDate, formatDuration, weekday, WEEKDAY_SHORT } from '@/lib/dates'
import type { DayHours } from '@/lib/break-types'
import { BreakChips } from '../ui/day-hours'
import { CELL_META, type Cell, type CellStatus, type MonthSummary } from '@/modules/muster/attendance/register'
import { DAY_FILL } from '../ui/day-fill'
import { OverrideDialog } from './override-dialog'

/** `hours`: the month's effective and payable minutes and breaks per type (lib/break-types). */
export type GridRow = { employeeId: string; name: string; code: string; department: string | null; cells: Cell[]; summary: MonthSummary; hours?: DayHours }

/** A cell's pill: the Figma day-pill fills (mint, amber, pink...), dimmed when only assumed. */
const cellStyle = (c: Cell): CSSProperties | undefined => {
  if (c.status === 'na' || c.status === 'upcoming' || c.status === 'unmarked') return undefined
  const fill = DAY_FILL[CELL_META[c.status].tone]
  return { background: fill.bg, color: fill.ink }
}

const cellClass = (c: Cell) => {
  if (c.status === 'na') return 'text-fg-3/40'
  if (c.status === 'upcoming') return 'bg-control'
  if (c.status === 'unmarked') return 'bg-control text-fg-3 outline-1 -outline-offset-1 outline-dashed outline-white/30'
  // A week off is the Figma's empty day (#171717), told apart from upcoming days by its code and a faint hairline.
  if (c.status === 'weekoff') return cn('text-fg-3 ring-1 ring-inset ring-white/[0.08]', c.source === 'override' && 'ring-[1.5px] ring-white ring-offset-1 ring-offset-[#262628]')
  return cn(c.assumed && 'opacity-45', c.source === 'override' && 'ring-[1.5px] ring-white ring-offset-1 ring-offset-[#262628]')
}

type Props = { days: string[]; rows: GridRow[]; holidayNames: Record<string, string>; canEdit: boolean; today: string }

/** Month register: people × days, coloured by status (red only where pay is lost). Click a past cell to override it. */
export function RegisterGrid({ days, rows, holidayNames, canEdit, today }: Props) {
  const [target, setTarget] = useState<{ row: GridRow; cell: Cell } | null>(null)
  const editable = (c: Cell) => canEdit && c.status !== 'na' && c.date <= today
  return (
    <>
      <div className="card-table overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="sticky left-0 z-10 min-w-32 bg-[#282829] px-4 py-2.5 text-left text-sm font-normal text-white sm:min-w-52">Person</th>
                {days.map((d) => {
                  const holiday = holidayNames[d]
                  return (
                    <th key={d} scope="col" title={holiday ? `${formatDate(d)}: ${holiday}` : formatDate(d, { withWeekday: true })} className={cn('px-0.5 py-2 text-center font-normal', d === today ? 'text-white' : holiday ? 'text-pink' : 'text-[#929394]')}>
                      <span className="block text-[11px]">{WEEKDAY_SHORT[weekday(d)].slice(0, 2)}</span>
                      <span className={cn('mx-auto mt-0.5 flex h-[18px] min-w-[22px] items-center justify-center rounded-full px-1 text-[12px] tabular-nums', d === today ? 'bg-white font-semibold text-[#200C55]' : 'text-white/85')}>{Number(d.slice(8))}</span>
                    </th>
                  )
                })}
                <th scope="col" className="px-3 py-2 text-right text-sm font-normal text-white">Payable</th>
                <th scope="col" className="px-3 py-2 text-right text-sm font-normal text-white">LOP</th>
                <th scope="col" title="Hours actually worked" className="whitespace-nowrap px-3 py-2 text-right text-sm font-normal text-white">Effective h</th>
                <th scope="col" title="Worked plus paid breaks within their daily limits" className="whitespace-nowrap px-3 py-2 text-right text-sm font-normal text-white">Payable h</th>
                <th scope="col" className="px-3 py-2 text-left text-sm font-normal text-white">Breaks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employeeId} className="group transition-colors duration-150 hover:bg-white/[0.04]">
                  <th scope="row" className="sticky left-0 z-10 max-w-32 bg-[#282829] px-4 py-1.5 text-left font-normal sm:max-w-none">
                    <Link href={`/app/hr/people/${row.employeeId}?tab=attendance`} className="block truncate text-[13px] text-white transition-colors hover:text-blush">{row.name}</Link>
                    <span className="block truncate text-[11px] text-fg-2">{row.department ?? row.code}</span>
                  </th>
                  {row.cells.map((c) => {
                    const meta = CELL_META[c.status]
                    const label = `${row.name}, ${formatDate(c.date)}: ${meta.label}${c.assumed ? ' (not marked, assumed)' : ''}${c.note ? ` · ${c.note}` : ''}`
                    return (
                      <td key={c.date} className="px-0.5 py-1 text-center coarse:px-1">
                        <button
                          type="button"
                          title={label}
                          aria-label={label}
                          disabled={!editable(c)}
                          onClick={() => setTarget({ row, cell: c })}
                          style={cellStyle(c)}
                          className={cn(
                            'press relative mx-auto flex h-[22px] min-w-[30px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums transition-transform duration-150 coarse:h-9 coarse:min-w-10 coarse:text-[11px]',
                            cellClass(c),
                            editable(c) ? 'cursor-pointer hover:-translate-y-px' : 'cursor-default',
                          )}
                        >
                          {c.status === 'na' ? '–' : meta.short}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-3 text-right text-[13px] font-medium tabular-nums text-white">{row.summary.payableDays}</td>
                  <td className={cn('px-3 text-right text-[13px] font-medium tabular-nums', row.summary.lopDays > 0 ? 'text-[#FF6A66]' : 'text-fg-3')}>{row.summary.lopDays}</td>
                  <td className="whitespace-nowrap px-3 text-right text-[13px] tabular-nums text-white">{row.hours?.effective ? formatDuration(row.hours.effective) : '–'}</td>
                  <td className="whitespace-nowrap px-3 text-right text-[13px] tabular-nums text-white">{row.hours?.payable ? formatDuration(row.hours.payable) : '–'}</td>
                  <td className="min-w-40 px-3">{row.hours ? <BreakChips breaks={row.hours.breaks} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Legend />
      {target ? <OverrideDialog key={`${target.row.employeeId}-${target.cell.date}`} row={target.row} cell={target.cell} onClose={() => setTarget(null)} /> : null}
    </>
  )
}

const LEGEND: CellStatus[] = ['present', 'work_from_home', 'late', 'paid_half_day', 'half_day', 'on_duty', 'leave', 'sick_leave', 'lop', 'absent', 'holiday', 'weekoff', 'unmarked', 'na']

/** The legend uses the cells themselves (pill + code), so nothing new has to be learned. */
function Legend() {
  const pill = 'flex h-[18px] min-w-[26px] items-center justify-center rounded-full px-1 text-[9px] font-semibold'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-fg-2">
      {LEGEND.map((s) => {
        const sample: Cell = { date: '', status: s, source: 'punch', pay: 1, assumed: false } as Cell
        return (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn(pill, cellClass(sample))} style={cellStyle(sample)}>{s === 'na' ? '–' : CELL_META[s].short}</span>
            {CELL_META[s].label}
          </span>
        )
      })}
      <span className="inline-flex items-center gap-1.5"><span className={cn(pill, 'ring-[1.5px] ring-white ring-offset-1 ring-offset-bg')} style={cellStyle({ date: '', status: 'present', source: 'override', pay: 1, assumed: false } as Cell)}>P</span> Set by HR</span>
      <span className="inline-flex items-center gap-1.5"><span className={cn(pill, 'opacity-45')} style={cellStyle({ date: '', status: 'present', source: 'punch', pay: 1, assumed: true } as Cell)}>P</span> Assumed, not marked</span>
    </div>
  )
}
