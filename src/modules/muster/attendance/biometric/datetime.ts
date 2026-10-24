import { addDays } from '@/lib/dates'

/**
 * Dates and times as attendance devices write them (pure). Device clocks run on local wall time,
 * so a plain "2026-10-01 09:55:12" is read as IST. A timestamp with a zone ("…Z" or "+05:30")
 * is converted to IST first.
 */

export type LocalStamp = { date: string; seconds: number }

const IST_OFFSET_SECONDS = 330 * 60
const DAY_SECONDS = 86_400
const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }

const isRealDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const at = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(v)
}
const pad = (n: string | number) => String(n).padStart(2, '0')

/** "2026-10-01", "2026/10/01", "01-10-2026", "01/10/2026", "01.10.2026", "01-Oct-2026" → "2026-10-01" (day first, as Indian exports write it). */
export function parseDay(raw: string): string | null {
  const v = raw.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(v)
  if (m) return checked(`${m[1]}-${pad(m[2])}-${pad(m[3])}`)
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v)
  if (m) return checked(`${m[3]}-${pad(m[2])}-${pad(m[1])}`)
  m = /^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{4})$/.exec(v)
  if (m && MONTHS[m[2].toLowerCase()]) return checked(`${m[3]}-${MONTHS[m[2].toLowerCase()]}-${pad(m[1])}`)
  return null
}

const checked = (day: string) => (isRealDay(day) ? day : null)

/** "9:55", "09:55:12", "9:55 PM", "21:55:12.000" → seconds after midnight. */
export function parseClock(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([AaPp][Mm])?$/.exec(raw.trim())
  if (!m) return null
  let hours = Number(m[1])
  const minutes = Number(m[2])
  const seconds = Number(m[3] ?? 0)
  if (m[4]) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (m[4].toLowerCase() === 'pm' ? 12 : 0)
  }
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return hours * 3600 + minutes * 60 + seconds
}

/** ISO with a zone, converted to IST wall time. */
function zoned(v: string): LocalStamp | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})$/i.exec(v)
  if (!m) return null
  const ms = Date.parse(`${m[1]}T${m[2]}${m[3].length === 5 ? `${m[3].slice(0, 3)}:${m[3].slice(3)}` : m[3]}`)
  if (Number.isNaN(ms)) return null
  const local = Math.floor(ms / 1000) + IST_OFFSET_SECONDS
  const dayIndex = Math.floor(local / DAY_SECONDS)
  return { date: new Date(dayIndex * DAY_SECONDS * 1000).toISOString().slice(0, 10), seconds: local - dayIndex * DAY_SECONDS }
}

/** A combined date and time ("2026-10-01 09:55:12", "01/10/2026 9:55 PM", ISO), or null. A date alone gives seconds = null. */
export function parseStamp(raw: string): { date: string; seconds: number | null } | null {
  const v = raw.trim().replace(/\s+/g, ' ')
  if (!v) return null
  const withZone = zoned(v)
  if (withZone) return withZone
  const dayOnly = parseDay(v)
  if (dayOnly) return { date: dayOnly, seconds: null }
  // The date part may hold spaces ("01 Oct 2026"), so split at the time at the end.
  const split = TRAILING_TIME.exec(v)
  if (!split) return null
  const date = parseDay(split[1])
  const seconds = parseClock(split[2])
  return date && seconds !== null ? { date, seconds } : null
}

/** "<date>[ or T]<H:MM[:SS[.fff]] [AM|PM]>" at the end of a stamp. */
const TRAILING_TIME = /^(.+?)[ T](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[AaPp][Mm])?)$/

/** Seconds (may run past 24h for the next morning) → "HH:MM". */
export const clockOf = (seconds: number): string => `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}`

export const previousDay = (date: string): string => addDays(date, -1)
