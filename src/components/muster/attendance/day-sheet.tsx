'use client'

import { CheckCheck, ChevronDown, Laptop } from 'lucide-react'
import { useState } from 'react'
import { formatDate, formatDuration, formatTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { chipClass } from '../ui/filter-chips'
import { DayHoursLine } from '../ui/day-hours'
import { PunchPlaces } from '../ui/punch-places'
import { markAttendance, markRemainingPresent } from '@/modules/muster/attendance/daily-actions'
import type { DaySheetRow } from '@/modules/muster/attendance/day-sheet'
import { CELL_META, DAILY_STATUSES, isUnmarked, isWorkingRow, needsReason, STATUS_HINT, type Cell, type OverrideStatus } from '@/modules/muster/attendance/register'

type Props = { date: string; rows: DaySheetRow[]; canEdit: boolean; departmentId?: string }
type Pending = { row: DaySheetRow; status: OverrideStatus }

function sourceNote(row: DaySheetRow): string {
  const c = row.cell
  if (c.status === 'na') return row.joinDate > c.date ? `Joins on ${formatDate(row.joinDate)}` : 'Not employed on this day'
  if (c.status === 'upcoming' || c.status === 'unmarked') return 'Not marked yet'
  if (c.assumed) return `Not marked yet · counts as ${CELL_META[c.status].label.toLowerCase()} if left`
  const times = [row.inAt ? `In ${formatTime(row.inAt)}` : '', row.outAt ? `Out ${formatTime(row.outAt)}` : ''].filter(Boolean).join(' · ')
  if (c.source === 'punch') return times || 'From check-in'
  if (c.source === 'leave') return `Approved leave${c.note ? `: ${c.note}` : ''}`
  if (c.source === 'calendar') return c.note ? `Holiday: ${c.note}` : 'Week off'
  return [c.note ? `Marked: ${c.note}` : 'Marked by HR', times].filter(Boolean).join(' · ')
}

/** The onboarding chip, one size down for a dense sheet. */
const statusChip = (active: boolean) => cn(chipClass(active), 'h-7 px-2.5 text-[12px] disabled:opacity-60')

/** The everyday marks stay one tap away; the rest sit behind "More" so eighteen rows don't read as a wall of chips. */
const QUICK: readonly OverrideStatus[] = ['present', 'work_from_home', 'absent', 'paid_half_day']
const MORE = DAILY_STATUSES.filter((s) => !QUICK.includes(s))

function StatusPicker({ name, active, disabled, onChoose }: { name: string; active: OverrideStatus | null; disabled: boolean; onChoose: (s: OverrideStatus) => void }) {
  const inMore = active !== null && MORE.includes(active as (typeof MORE)[number])
  return (
    // One line per person: on a phone the row scrolls sideways instead of stacking into a second line of chips.
    <div className="flex gap-1.5 max-lg:-mx-1 max-lg:overflow-x-auto max-lg:px-1 max-lg:scrollbar-none lg:shrink-0 [&>*]:shrink-0" role="radiogroup" aria-label={`${name}'s status`}>
      {QUICK.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={active === s} title={STATUS_HINT[s]} disabled={disabled} className={statusChip(active === s)} onClick={() => onChoose(s)}>
          {CELL_META[s].label}
        </button>
      ))}
      <DropdownMenu
        align="end"
        items={MORE.map((s) => ({ label: CELL_META[s].label, onSelect: () => onChoose(s), disabled: disabled || active === s }))}
        trigger={
          <button type="button" role="radio" aria-checked={inMore} aria-haspopup="menu" disabled={disabled} className={statusChip(inMore)}>
            {inMore ? CELL_META[active as OverrideStatus].label : 'More'}
            <ChevronDown />
          </button>
        }
      />
    </div>
  )
}

/** One row per person for a day: tap a status to save it. Changing a recorded status asks why. */
export function DaySheet({ date, rows, canEdit, departmentId }: Props) {
  const [optimistic, setOptimistic] = useState<Record<string, OverrideStatus>>({})
  const [pending, setPending] = useState<Pending | null>(null)
  const [reason, setReason] = useState('')
  const [mark, marking] = useAction(markAttendance)
  const [markRest, markingRest] = useAction(markRemainingPresent)

  const cellOf = (row: DaySheetRow): Cell => (optimistic[row.employeeId] ? { ...row.cell, status: optimistic[row.employeeId], source: 'override', assumed: false } : row.cell)
  const working = rows.filter((r) => isWorkingRow(r.cell))
  const unmarked = working.filter((r) => isUnmarked(cellOf(r))).length

  const save = async (row: DaySheetRow, status: OverrideStatus, why?: string) => {
    setOptimistic((o) => ({ ...o, [row.employeeId]: status }))
    const result = await mark({ date, marks: [{ employeeId: row.employeeId, status, reason: why }] })
    if (!result.ok) setOptimistic((o) => Object.fromEntries(Object.entries(o).filter(([id]) => id !== row.employeeId)))
    return result.ok
  }

  const choose = (row: DaySheetRow, status: OverrideStatus) => {
    if (needsReason(cellOf(row), status)) {
      setReason('')
      setPending({ row, status })
      return
    }
    void save(row, status)
  }

  return (
    <div className="card-table overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-[23px]">
        <div className="min-w-0 flex-1">
          <Progress size="lg" value={working.length ? ((working.length - unmarked) / working.length) * 100 : 100} label={`${working.length - unmarked} of ${working.length} marked`} />
        </div>
        {canEdit && unmarked > 0 ? (
          <Button variant="primary" size="sm" icon={<CheckCheck className="size-4" />} loading={markingRest} onClick={() => markRest({ date, departmentId })}>
            Mark remaining {unmarked} present
          </Button>
        ) : null}
      </div>
      <ul className="py-1.5">
        {rows.map((row) => {
          const cell = cellOf(row)
          const marked = !isUnmarked(cell) && cell.status !== 'na'
          return (
            // Details take the free width (nothing cut short); the status buttons sit at the row's right edge.
            <li key={row.employeeId} className={cn('flex flex-col gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-white/[0.04] sm:px-[23px] lg:flex-row lg:items-center lg:justify-between lg:gap-8', cell.status === 'na' && 'opacity-50')}>
              <div className="flex min-w-0 items-center gap-3 lg:flex-1">
                <Avatar name={row.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{row.name}</p>
                  <p className="truncate text-xs text-fg-2">
                    {[row.department, sourceNote({ ...row, cell })].filter(Boolean).join(' · ')}
                    {cell.status === 'late' && row.lateMinutes != null ? <> · <span className="text-warning">Late · {formatDuration(row.lateMinutes)}</span></> : null}
                  </p>
                  {row.hours ? <DayHoursLine hours={row.hours} live={row.live} className="mt-0.5" /> : null}
                  <PunchPlaces places={row.places} className="mt-0.5" />
                  {row.remote ? <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-fg-2" title="Works remotely, so check-in did not ask for a location"><Laptop className="size-3" aria-hidden /> Remote</p> : null}
                </div>
              </div>
              {cell.status === 'na' ? null : canEdit ? (
                // A late check-in is a present day (paid in full); the amber "Late" beside the time says the rest.
                <StatusPicker name={row.name} active={marked ? ((cell.status === 'late' ? 'present' : cell.status) as OverrideStatus) : null} disabled={marking} onChoose={(st) => choose(row, st)} />
              ) : (
                <Badge tone={marked ? CELL_META[cell.status].tone : 'neutral'}>{marked ? CELL_META[cell.status].label : 'Not marked yet'}</Badge>
              )}
            </li>
          )
        })}
      </ul>
      {pending ? (
        <Dialog
          open
          onOpenChange={(open) => (open ? null : setPending(null))}
          title={`${pending.row.name} · ${CELL_META[pending.status].label}`}
          description={`${formatDate(date, { withWeekday: true })}. Now ${CELL_META[cellOf(pending.row).status].label.toLowerCase()} (${sourceNote(pending.row).toLowerCase()}). Changing a recorded day needs a reason; it is kept in the audit log.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              <Button variant="primary" loading={marking} disabled={!reason.trim()} onClick={async () => ((await save(pending.row, pending.status, reason.trim())) ? setPending(null) : null)}>Save</Button>
            </>
          }
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Reason <span className="text-[#F64A45]">*</span></span>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={280} placeholder="Forgot to check in; was at the client site" autoFocus />
          </label>
        </Dialog>
      ) : null}
    </div>
  )
}
