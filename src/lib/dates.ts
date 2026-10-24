/**
 * Dates in Asia/Kolkata. Day-level fields are 'YYYY-MM-DD' strings;
 * timestamps are Date. IST has no DST, so a fixed +05:30 offset is exact.
 */

export const TIMEZONE = 'Asia/Kolkata'
export const IST_OFFSET_MINUTES = 330
const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The IST calendar date of an instant as 'YYYY-MM-DD'. */
export function isoDateIST(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
}

export const todayIST = (now: Date = new Date()) => isoDateIST(now)

/** Minutes since IST midnight for an instant (e.g. 10:30 IST -> 630). */
export function minutesOfDayIST(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

/** The instant for an IST wall-clock time on a day: istInstant('2026-10-01', '10:00'). */
export function istInstant(date: string, time = '00:00'): Date {
  const [h, m] = time.split(':').map(Number)
  const utc = Date.parse(`${date}T00:00:00Z`) + ((h || 0) * 60 + (m || 0) - IST_OFFSET_MINUTES) * 60_000
  return new Date(utc)
}

/** 'HH:MM' -> minutes. */
export const parseHHMM = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

/** Date-only arithmetic on 'YYYY-MM-DD'. */
export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso)
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 0 = Sunday ... 6 = Saturday for a 'YYYY-MM-DD'. */
export function weekday(iso: string): number {
  const { y, m, d } = parts(iso)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export const daysBetween = (from: string, to: string) => {
  const a = parts(from)
  const b = parts(to)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS)
}

/**
 * "20 Jul 2026" from a 'YYYY-MM-DD' string or a Date (IST). `locale` (BCP 47, e.g. 'hi-IN') prints the
 * month and weekday names in that language through Intl; without it the English form above is kept.
 */
export function formatDate(value: string | Date | null | undefined, opts: { withWeekday?: boolean; short?: boolean; locale?: string } = {}): string {
  if (!value) return '—'
  // A full timestamp ("2026-10-01T20:08:00.000Z") is an instant: show its IST day, not the UTC one.
  const at = typeof value === 'string' && value.includes('T') ? new Date(value) : value
  if (at instanceof Date && Number.isNaN(at.getTime())) return '—'
  const iso = typeof at === 'string' ? at.slice(0, 10) : isoDateIST(at)
  const { y, m, d } = parts(iso)
  if (!y || !m || !d) return '—'
  if (opts.locale) return localizedDate(y, m, d, opts.locale, opts)
  const base = opts.short ? `${d} ${MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]} ${y}`
  return opts.withWeekday ? `${WEEKDAYS[weekday(iso)].slice(0, 3)}, ${base}` : base
}

/** Noon UTC on the calendar day, formatted in UTC, so the printed day is the IST day already worked out. */
function localizedDate(y: number, m: number, d: number, locale: string, opts: { withWeekday?: boolean; short?: boolean }): string {
  const format = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', ...(opts.short ? {} : { year: 'numeric' }), ...(opts.withWeekday ? { weekday: 'short' } : {}) })
  return format.format(new Date(Date.UTC(y, m - 1, d, 12)))
}

/** "20 Jul 2026, 3:45 pm" in IST. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const at = new Date(value)
  return `${formatDate(at)}, ${formatTime(at)}`
}

/** "3:45 pm" in IST. */
export function formatTime(value: Date | string): string {
  const mins = minutesOfDayIST(new Date(value))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** "2h 53m" from minutes. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

/** "3 min ago", "2 h ago", "Yesterday", then a date. */
export function timeAgo(value: Date | string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(value).getTime())
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(new Date(value))
}

/** First and last day of a month: monthRange('2026-10') -> { start: '2026-10-01', end: '2026-10-31', days: 31 }. */
export function monthRange(month: string): { start: string; end: string; days: number } {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(days).padStart(2, '0')}`, days }
}

/** 'YYYY-MM' of a day or now (IST). */
export const monthOf = (iso: string = todayIST()) => iso.slice(0, 7)

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** "October 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** Every 'YYYY-MM-DD' from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day)
  return out
}

/** Weekday numbers follow JS getDay(): 0 = Sunday ... 6 = Saturday (Org.workWeek uses the same numbering). */
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
/** Monday to Saturday. */
export const DEFAULT_WORK_WEEK: readonly number[] = [1, 2, 3, 4, 5, 6]

/** "Mon–Sat", "Mon–Fri", "Mon, Wed, Fri" from a workWeek list (getDay numbering, Monday first). */
export function formatWorkWeek(workWeek: readonly number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const days = order.filter((d) => workWeek.includes(d))
  if (!days.length) return 'No working days'
  const positions = days.map((d) => order.indexOf(d))
  const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1)
  if (contiguous && days.length > 2) return `${WEEKDAY_SHORT[days[0]]}–${WEEKDAY_SHORT[days[days.length - 1]]}`
  return days.map((d) => WEEKDAY_SHORT[d]).join(', ')
}

/** IST day boundaries of a 'YYYY-MM-DD' date as instants: start inclusive, end exclusive (next midnight). */
export function dayBoundsIST(iso: string): { start: Date; end: Date } {
  return { start: istInstant(iso, '00:00'), end: istInstant(addDays(iso, 1), '00:00') }
}

/**
 * Working days between two dates, inclusive. `workWeek` lists weekday numbers
 * that are working days (default Monday-Saturday); `holidays` are skipped.
 */
export function workingDaysBetween(from: string, to: string, workWeek: readonly number[] = DEFAULT_WORK_WEEK, holidays: readonly string[] = []): number {
  if (to < from) return 0
  const off = new Set(holidays)
  return eachDay(from, to).filter((d) => workWeek.includes(weekday(d)) && !off.has(d)).length
}

/** Indian fiscal year (April-March): fiscalYear('2026-10-01') -> '2026-27'. */
export function fiscalYear(value: string | Date = new Date()): string {
  const iso = typeof value === 'string' ? value : isoDateIST(value)
  const { y, m } = parts(iso)
  const start = m >= 4 ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** "Good morning" / "Good afternoon" / "Good evening" by IST hour. */
export function greeting(at: Date = new Date()): string {
  const hour = Math.floor(minutesOfDayIST(at) / 60)
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Monday of the ISO week containing `iso`. */
export function startOfWeek(iso: string): string {
  const wd = weekday(iso)
  return addDays(iso, wd === 0 ? -6 : 1 - wd)
}
