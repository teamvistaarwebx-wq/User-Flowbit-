import { eachDay, monthRange, weekday } from '@/lib/dates'
import type { Tone } from '@/lib/status'
import { CELL_META, type Cell } from '@/modules/muster/attendance/register'

/**
 * "My attendance" card (pure): month summary and calendar marks from the
 * member's AttendanceDay rows. Absent is derived for past working days with no
 * record from the day the member joined; today without a record is not counted yet.
 * A member linked to a Muster employee gets the register instead (cellsAttendance),
 * so Home agrees with My attendance.
 */

export type AttendanceRow = { date: string; status: string; firstIn?: Date | string | null }

export type MonthAttendance = {
  onTime: number
  late: number
  halfDay: number
  absent: number
  leave: number
  /** Working days counted in the bar (on time + late + half day + absent). */
  base: number
  marks: Record<string, { tone: Tone; label: string }>
}

const LABEL: Record<string, string> = {
  present: 'On time', on_duty: 'On duty', work_from_home: 'Work from home', late: 'Late', half_day: 'Unpaid half day', paid_half_day: 'Half day',
  absent: 'Absent', leave: 'On leave', sick_leave: 'Sick leave', holiday: 'Holiday', weekoff: 'Week off',
}

const ON_TIME = new Set(['present', 'on_duty', 'work_from_home'])
const HALF = new Set(['half_day', 'paid_half_day'])
const LEAVE = new Set(['leave', 'sick_leave'])

/** `since`: first day the member could have a record (joined the workspace); earlier days are left blank. */
export function monthAttendance(rows: AttendanceRow[], month: string, today: string, workWeek: readonly number[], since = ''): MonthAttendance {
  const byDate = new Map(rows.map((r) => [r.date, r]))
  const { start, end } = monthRange(month)
  const out: MonthAttendance = { onTime: 0, late: 0, halfDay: 0, absent: 0, leave: 0, base: 0, marks: {} }
  const last = end < today ? end : today
  if (start > last) return out
  for (const date of eachDay(start, last)) {
    const row = byDate.get(date)
    if (!row && date < since) continue
    const workday = workWeek.includes(weekday(date))
    const status = row?.status
    if (status && LEAVE.has(status)) {
      out.leave++
      out.marks[date] = { tone: 'info', label: LABEL[status] }
      continue
    }
    if (status === 'holiday' || status === 'weekoff') {
      out.marks[date] = { tone: 'neutral', label: LABEL[status] }
      continue
    }
    const notYet = date === today && (!row || (status === 'absent' && !row.firstIn))
    if (notYet) continue
    if (!row) {
      if (!workday) continue
      out.absent++
      out.base++
      out.marks[date] = { tone: 'danger', label: 'Absent' }
      continue
    }
    const known = status ?? 'absent'
    if (ON_TIME.has(known)) out.onTime++
    else if (known === 'late') out.late++
    else if (HALF.has(known)) out.halfDay++
    else out.absent++
    out.base++
    const tone: Tone = ON_TIME.has(known) ? 'success' : known === 'late' || HALF.has(known) ? 'warning' : 'danger'
    out.marks[date] = { tone, label: LABEL[known] ?? 'Absent' }
  }
  return out
}

/**
 * The same card from the Muster register cells (what /app/me/attendance shows):
 * the bar counts recorded days only, as My attendance does; assumed and
 * unmarked days appear on the calendar with their register label.
 */
export function cellsAttendance(cells: readonly Cell[], month: string, today: string): MonthAttendance {
  const { start, end } = monthRange(month)
  const out: MonthAttendance = { onTime: 0, late: 0, halfDay: 0, absent: 0, leave: 0, base: 0, marks: {} }
  for (const c of cells) {
    if (c.date < start || c.date > end || c.date > today || c.status === 'na' || c.status === 'upcoming') continue
    const meta = CELL_META[c.status]
    out.marks[c.date] = { tone: meta.tone, label: c.assumed ? `${meta.label} (not marked yet)` : (c.note ?? meta.label) }
    if (c.assumed) continue
    if (LEAVE.has(c.status)) out.leave++
    else if (ON_TIME.has(c.status)) out.onTime++
    else if (c.status === 'late') out.late++
    else if (HALF.has(c.status)) out.halfDay++
    else if (c.status === 'absent' || c.status === 'lop') out.absent++
    else continue
    if (!LEAVE.has(c.status)) out.base++
  }
  return out
}
