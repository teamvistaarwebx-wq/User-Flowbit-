import { computeDay, DEFAULT_OFFICE_HOURS, type OfficeHours } from '@/lib/attendance-core'
import { formatDate, formatMonth, istInstant } from '@/lib/dates'
import type { CsvRow } from '../import/csv'
import { CELL_META, type CellStatus, type OverrideStatus } from './register'

/**
 * Attendance CSV import (pure): columns code, date, status, in, out, note.
 * Every row is checked and nothing is written until HR commits; the commit
 * re-checks the raw file. Status may be left blank when an in time is given
 * (it is then worked out from the times, like a check-in).
 */

export const IMPORT_COLUMNS = ['code', 'date', 'status', 'in', 'out', 'note'] as const
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]
export const MAX_IMPORT_ROWS = 5000
const MAX_NOTE = 280

export const TEMPLATE_ROWS: Record<ImportColumn, string>[] = [
  { code: 'VW-0001', date: '2026-10-01', status: 'P', in: '09:55', out: '19:05', note: '' },
  { code: 'VW-0002', date: '2026-10-01', status: 'WFH', in: '', out: '', note: 'Internet outage at the office' },
  { code: 'VW-0003', date: '2026-10-01', status: '', in: '10:40', out: '19:10', note: 'Status worked out from the times' },
  { code: 'VW-0004', date: '2026-10-01', status: 'SL', in: '', out: '', note: 'Fever' },
]

const HEADERS: Record<string, ImportColumn> = {
  code: 'code', employee_code: 'code', emp_code: 'code', employee_id: 'code',
  date: 'date', day: 'date',
  status: 'status', mark: 'status',
  in: 'in', in_time: 'in', check_in: 'in', checkin: 'in',
  out: 'out', out_time: 'out', check_out: 'out', checkout: 'out',
  note: 'note', notes: 'note', remarks: 'note', reason: 'note',
}

/** Short codes and words HR already uses (P, A, WFH, PL, SL, HD, UHD, WO, H, OD …). */
export const STATUS_ALIASES: Record<string, OverrideStatus> = {
  p: 'present', present: 'present',
  wfh: 'work_from_home', work_from_home: 'work_from_home', remote: 'work_from_home',
  od: 'on_duty', on_duty: 'on_duty',
  a: 'absent', ab: 'absent', absent: 'absent',
  pl: 'leave', l: 'leave', leave: 'leave', paid_leave: 'leave',
  sl: 'sick_leave', sick: 'sick_leave', sick_leave: 'sick_leave',
  hd: 'paid_half_day', half: 'paid_half_day', half_day: 'paid_half_day', phd: 'paid_half_day',
  uhd: 'half_day', unpaid_half_day: 'half_day',
  wo: 'weekoff', off: 'weekoff', week_off: 'weekoff', weekoff: 'weekoff', weekly_off: 'weekoff',
  h: 'holiday', holiday: 'holiday',
  late: 'late', lt: 'late',
}

/** The code an export writes for each status, chosen so the import reads it back. */
export const EXPORT_CODE: Partial<Record<CellStatus, string>> = {
  present: 'P', work_from_home: 'WFH', on_duty: 'OD', late: 'LATE', paid_half_day: 'HD', half_day: 'UHD', absent: 'A', leave: 'PL', sick_leave: 'SL', holiday: 'H', weekoff: 'WO', lop: 'LOP',
}

export const parseStatus = (raw: string): OverrideStatus | null => STATUS_ALIASES[raw.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? null

const TIME = /^(\d{1,2}):([0-5]\d)$/
const LAST_HOUR = 23
/** 24:00–29:59 is the next morning on a night shift (biometric imports only; 01:30 → 25:30). */
export const LAST_NEXT_DAY_HOUR = 29
const normaliseTime = (raw: string, lastHour = LAST_HOUR): string | null => {
  const m = TIME.exec(raw.trim())
  return m && Number(m[1]) <= lastHour ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}
const isRealDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v)

export type ImportEmployee = { id: string; code: string; name: string; joinDate: string; exitDate?: string | null }

export type ImportContext = {
  /** Lower-cased employee code → employee. */
  employees: Map<string, ImportEmployee>
  lockedMonths: ReadonlySet<string>
  today: string
  officeHours?: OfficeHours
  /** Accept 24:00–29:59 for punches after midnight that belong to the day's shift (biometric imports). */
  allowAfterMidnight?: boolean
}

export type ImportRecord = { employeeId: string; date: string; status: OverrideStatus; in?: string; out?: string; note?: string }
export type CheckedRow = { line: number; code: string; name: string | null; date: string; status: string; errors: string[]; warnings: string[]; record?: ImportRecord }

/** What the preview shows (no record ids). */
export type AttendanceImportPreview = {
  summary: string
  ready: number
  ignored: string[]
  rows: Pick<CheckedRow, 'line' | 'code' | 'name' | 'date' | 'status' | 'errors' | 'warnings'>[]
}

/** Which file header feeds each column; unknown headers are listed, missing required ones too. */
export function mapColumns(headers: readonly string[]): { columns: Partial<Record<ImportColumn, string>>; missing: ImportColumn[]; ignored: string[] } {
  const columns: Partial<Record<ImportColumn, string>> = {}
  const ignored: string[] = []
  for (const h of headers) {
    const col = HEADERS[h]
    if (col && !columns[col]) columns[col] = h
    else if (h) ignored.push(h)
  }
  const missing = (['code', 'date'] as const).filter((c) => !columns[c])
  return { columns, missing, ignored }
}

function derivedStatus(date: string, inAt: string, outAt: string | undefined, hours: OfficeHours): OverrideStatus {
  const punches = [{ type: 'in' as const, at: istInstant(date, inAt) }, ...(outAt ? [{ type: 'out' as const, at: istInstant(date, outAt) }] : [])]
  const status = computeDay({ punches }, hours, punches[punches.length - 1].at).status
  return status === 'late' || status === 'half_day' ? status : 'present'
}

function checkRow(row: CsvRow, columns: Partial<Record<ImportColumn, string>>, ctx: ImportContext): CheckedRow {
  const get = (c: ImportColumn) => (columns[c] ? (row.values[columns[c]!] ?? '').trim() : '')
  const [code, date, rawStatus, rawIn, rawOut, note] = IMPORT_COLUMNS.map(get)
  const errors: string[] = []
  const warnings: string[] = []
  const employee = code ? ctx.employees.get(code.toLowerCase()) : undefined
  if (!code) errors.push('Give the employee code.')
  else if (!employee) errors.push(`No employee has the code ${code}.`)
  if (!isRealDate(date)) errors.push('Give the date as YYYY-MM-DD, e.g. 2026-10-01.')
  else {
    if (date > ctx.today) errors.push('That day has not happened yet.')
    if (ctx.lockedMonths.has(date.slice(0, 7))) errors.push(`${formatMonth(date.slice(0, 7))} is locked. Reopen it before importing into it.`)
    if (employee && date < employee.joinDate) errors.push(`${employee.name} joined on ${formatDate(employee.joinDate)}, after this day.`)
    if (employee?.exitDate && date > employee.exitDate) errors.push(`${employee.name} left on ${formatDate(employee.exitDate)}, before this day.`)
  }
  const lastHour = ctx.allowAfterMidnight ? LAST_NEXT_DAY_HOUR : LAST_HOUR
  const inAt = rawIn ? normaliseTime(rawIn, lastHour) : undefined
  const outAt = rawOut ? normaliseTime(rawOut, lastHour) : undefined
  if (inAt === null) errors.push('Give the in time as HH:MM in 24-hour time, e.g. 09:55.')
  if (outAt === null) errors.push('Give the out time as HH:MM in 24-hour time, e.g. 19:05.')
  if (outAt && !rawIn) errors.push('An out time needs an in time.')
  if (inAt && outAt && outAt <= inAt) errors.push('The out time is before the in time.')
  if (note.length > MAX_NOTE) errors.push(`Keep the note under ${MAX_NOTE} characters.`)
  let status = rawStatus ? parseStatus(rawStatus) : null
  if (rawStatus && !status) errors.push(`"${rawStatus}" is not a status. Use P, WFH, A, PL, SL, HD, UHD, WO, H or OD.`)
  if (!rawStatus && !rawIn) errors.push('Give a status, or an in time to work it out from.')
  if (!status && !rawStatus && inAt && !errors.length) status = derivedStatus(date, inAt, outAt ?? undefined, ctx.officeHours ?? DEFAULT_OFFICE_HOURS)
  if (status === 'weekoff' || status === 'holiday') warnings.push('The calendar sets week offs and holidays itself. This will override it.')
  const base = { line: row.line, code, name: employee?.name ?? null, date, status: status ? CELL_META[status].label : rawStatus, errors, warnings }
  if (errors.length || !employee || !status) return base
  return { ...base, record: { employeeId: employee.id, date, status, in: inAt ?? undefined, out: outAt ?? undefined, note: note || undefined } }
}

/** Checks every row; the same person and day twice in a file is an error on both lines. */
export function checkAttendanceRows(rows: readonly CsvRow[], columns: Partial<Record<ImportColumn, string>>, ctx: ImportContext): CheckedRow[] {
  const checked = rows.map((r) => checkRow(r, columns, ctx))
  const seen = new Map<string, number[]>()
  checked.forEach((r) => {
    if (!r.code || !r.date) return
    const key = `${r.code.toLowerCase()}|${r.date}`
    seen.set(key, [...(seen.get(key) ?? []), r.line])
  })
  return checked.map((r) => {
    const lines = seen.get(`${r.code.toLowerCase()}|${r.date}`) ?? []
    if (lines.length < 2) return r
    const others = lines.filter((l) => l !== r.line).join(', ')
    return { ...r, errors: [...r.errors, `The same person and day is also on line ${others}.`], record: undefined }
  })
}

export function importSummary(rows: readonly CheckedRow[]): string {
  const ready = rows.filter((r) => r.record).length
  const toFix = rows.length - ready
  return `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} checked: ${ready} ready to write${toFix ? `, ${toFix} to fix first` : ''}.`
}
