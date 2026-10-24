import { normaliseHeader } from '../../import/csv'
import { parseClock, parseStamp } from './datetime'
import type { BiometricFormat, PunchColumns, PunchField } from './types'
import { PUNCH_FIELDS } from './types'

/**
 * Raw punch logs from biometric devices (pure): detection and parsing into one punch per row.
 *
 * Formats and the column names they use (headers are compared after normaliseHeader, so
 * "Log Date" and "LogDate" both read as log_date / logdate):
 *
 * - eSSL eTimeTrackLite "attendance logs" / device logs. Its DeviceLogs tables hold UserId,
 *   LogDate (a datetime), DeviceId and Direction (in / out); report exports print
 *   "Employee Code", "Employee Name", "Log Date", "Direction" and "Device Name". The eSSL web
 *   service's transaction log returns EmployeeCode, LogDate, SerialNumber and PunchDirection.
 *   Sources: eTimetracklite Web API manual v1.0 (https://www.scribd.com/document/725479967/Web-API-Service-Sample-Data),
 *   and eSSL installs seen in the field; public docs for the export layout are thin, so the
 *   header list is broad and the person can map columns by hand.
 * - ZKTeco attlog.dat / ATTLOG.TXT (USB download): no header, one punch per line, tab-separated:
 *   user id (PIN), "YYYY-MM-DD HH:MM:SS", then status / verify / work code columns whose order
 *   varies by firmware. The ADMS push protocol sends the same ATTLOG line (PIN, time, status,
 *   verify, workcode). Sources: https://packagist.org/packages/tanemrahman/zkteco-adms,
 *   https://github.com/adrobinoga/pyzatt, https://github.com/fananimi/pyzk.
 * - ZKTeco CSV / XLSX exports: ZKTime / Attendance Management write "AC-No.", "Name", "Time",
 *   "State" (C/In, C/Out); ZKBioTime transactions write "Employee ID" / emp_code, "Date",
 *   "Time" or punch_time, "Punch State" and "Terminal SN".
 * - Anything else: a generic punch CSV whose columns the person picks.
 */

/** At most this many punch rows per file. */
export const MAX_PUNCH_ROWS = 50_000

export type PunchDirection = 'in' | 'out' | null
export type RawPunch = { line: number; deviceId: string; date: string; seconds: number; direction: PunchDirection }
export type SkippedLine = { line: number; reason: string }
export type { BiometricFormat, BiometricFormatChoice, PunchColumns, PunchField } from './types'
export { BIOMETRIC_FORMATS, FORMAT_LABELS, PUNCH_FIELDS } from './types'

export type ParsedPunches = { format: BiometricFormat; headers: string[]; columns: PunchColumns; punches: RawPunch[]; skipped: SkippedLine[] }

/** Header aliases per field, most specific first. */
const ALIASES: Record<PunchField, readonly string[]> = {
  id: ['userid', 'user_id', 'employeecode', 'employee_code', 'emp_code', 'empcode', 'ac_no', 'acno', 'enroll_no', 'enrollno', 'enrollnumber', 'enroll_number', 'pin', 'badgenumber', 'badge_number', 'employee_id', 'emp_id', 'empid', 'person_id', 'device_user_id', 'biometric_id', 'code', 'id', 'no'],
  datetime: ['logdate', 'log_date', 'log_date_time', 'logdatetime', 'log_time', 'logtime', 'punch_time', 'punchtime', 'punch_date_time', 'checktime', 'check_time', 'clock_time', 'datetime', 'date_time', 'timestamp', 'att_time', 'attendance_time', 'verify_time'],
  date: ['date', 'punch_date', 'att_date', 'attendance_date', 'log_day'],
  time: ['time', 'in_time', 'clock'],
  direction: ['direction', 'punchdirection', 'punch_direction', 'punch_state', 'punchstate', 'in_out', 'inout', 'in_out_mode', 'state', 'checktype', 'check_type', 'att_state', 'io', 'status'],
}

const ESSL_MARKERS = new Set(['logdate', 'log_date', 'userid', 'user_id', 'employeecode', 'punchdirection', 'deviceid', 'device_id', 'direction', 'device_name', 'serialnumber'])
const ZK_MARKERS = new Set(['ac_no', 'acno', 'enroll_no', 'enrollno', 'enrollnumber', 'pin', 'badgenumber', 'checktime', 'check_time', 'punch_state', 'verify_type', 'verifycode', 'terminal_sn', 'emp_code', 'workcode', 'work_code', 'new_state'])

/** A ZKTeco attlog line: PIN, date and time, then anything (status, verify, work code). */
const DAT_LINE = /^\s*([^\s,;]+)[\t ]+(\d{4}-\d{1,2}-\d{1,2})[\t ]+(\d{1,2}:\d{2}(?::\d{2})?)(?:[\t ]+(.*))?$/

const firstLines = (text: string, n: number) => text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).slice(0, n)

/** Guesses the format from the first lines (a header row, or attlog lines with none). */
export function detectFormat(text: string): BiometricFormat {
  const lines = firstLines(text, 5)
  if (lines.length && lines.every((l) => DAT_LINE.test(l))) return 'zkteco_dat'
  return detectFromHeaders(splitHeader(lines[0] ?? ''))
}

export function detectFromHeaders(rawHeaders: readonly string[]): BiometricFormat {
  const headers = rawHeaders.map(normaliseHeader)
  if (headers.some((h) => ZK_MARKERS.has(h))) return 'zkteco_csv'
  if (headers.some((h) => ESSL_MARKERS.has(h))) return 'essl'
  return 'generic'
}

const splitHeader = (line: string) => line.split(line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',').map((h) => h.replace(/^"|"$/g, ''))

/** The best column for each field; explicit picks win. A datetime alias that is also the only date column still reads as a datetime. */
export function guessColumns(headers: readonly string[], picks: PunchColumns = {}): PunchColumns {
  const taken = new Set(Object.values(picks).filter(Boolean))
  const out: PunchColumns = { ...picks }
  for (const field of PUNCH_FIELDS) {
    if (out[field]) continue
    const hit = ALIASES[field].find((alias) => headers.includes(alias) && !taken.has(alias))
    if (hit) {
      out[field] = hit
      taken.add(hit)
    }
  }
  return out
}

/** "in", "C/In", "Check In", "0" (ZKTeco check-in) → in; "out", "C/Out", "1" → out; else null. */
export function parseDirection(raw: string | undefined, numericZk = false): PunchDirection {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v) return null
  if (numericZk && /^\d+$/.test(v)) return v === '0' ? 'in' : v === '1' ? 'out' : null
  if (/\bout\b|c\/out|check_?out|checkout|^o$/.test(v)) return 'out'
  if (/\bin\b|c\/in|check_?in|checkin|^i$/.test(v)) return 'in'
  return null
}

/** Reads a ZKTeco attlog.dat. The third column is the punch state on most firmware (0 = in, 1 = out). */
export function parseAttlog(text: string): ParsedPunches {
  const punches: RawPunch[] = []
  const skipped: SkippedLine[] = []
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  lines.forEach((raw, i) => {
    if (!raw.trim()) return
    const line = i + 1
    const m = DAT_LINE.exec(raw)
    const stamp = m ? parseStamp(`${m[2]} ${m[3]}`) : null
    if (!m || !stamp || stamp.seconds === null) return void skipped.push({ line, reason: 'Not a punch line (user id, then YYYY-MM-DD HH:MM:SS).' })
    const rest = (m[4] ?? '').split(/\t|\s+/).filter(Boolean)
    punches.push({ line, deviceId: m[1], date: stamp.date, seconds: stamp.seconds, direction: parseDirection(rest[0], true) })
  })
  return { format: 'zkteco_dat', headers: [], columns: {}, punches, skipped }
}

export type PunchSheet = { headers: string[]; rows: { line: number; values: Record<string, string> }[] }

/** The date and seconds of one sheet row, from a datetime column or separate date and time columns. */
function stampOf(values: Record<string, string>, columns: PunchColumns): { date: string; seconds: number } | string {
  const dt = columns.datetime ? values[columns.datetime] ?? '' : ''
  const dateCell = columns.date ? values[columns.date] ?? '' : ''
  const timeCell = columns.time ? values[columns.time] ?? '' : ''
  // ZKTime writes the whole stamp in its "Time" column, so any of the three may hold date and time.
  const full = [dt, dateCell, timeCell].map(parseStamp).find((p) => p?.seconds != null)
  if (full?.seconds != null) return { date: full.date, seconds: full.seconds }
  const whole = parseStamp(dt) ?? parseStamp(dateCell)
  if (!whole) return dt || dateCell ? `"${dt || dateCell}" is not a date. Use YYYY-MM-DD or DD-MM-YYYY with the time.` : 'The date is missing.'
  const seconds = parseClock(timeCell)
  if (seconds == null) return timeCell ? `"${timeCell}" is not a time. Use HH:MM or HH:MM:SS.` : 'The time is missing.'
  return { date: whole.date, seconds }
}

/** Reads a CSV / XLSX punch sheet with the given (or guessed) columns. */
export function parsePunchSheet(sheet: PunchSheet, format: BiometricFormat, picks: PunchColumns = {}): ParsedPunches | { error: string } {
  const columns = guessColumns(sheet.headers, picks)
  if (!columns.id) return { error: 'Pick the column with the device user id or employee code.' }
  if (!columns.datetime && !columns.date && !columns.time) return { error: 'Pick the column with the punch date and time.' }
  const punches: RawPunch[] = []
  const skipped: SkippedLine[] = []
  for (const row of sheet.rows) {
    const deviceId = (row.values[columns.id] ?? '').trim()
    if (!deviceId) {
      skipped.push({ line: row.line, reason: 'The user id is blank.' })
      continue
    }
    const stamp = stampOf(row.values, columns)
    if (typeof stamp === 'string') {
      skipped.push({ line: row.line, reason: stamp })
      continue
    }
    const direction = parseDirection(columns.direction ? row.values[columns.direction] : undefined, format === 'zkteco_csv')
    punches.push({ line: row.line, deviceId, date: stamp.date, seconds: stamp.seconds, direction })
  }
  return { format, headers: sheet.headers, columns, punches, skipped }
}
