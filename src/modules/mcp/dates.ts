import { formatDate, todayIST } from '@/lib/dates'
import { dueDateFor, matchDate, matchTime, type TimeHit } from '@/modules/work/tasks/quick-parse-dates'

/**
 * Dates an AI passes in a change ("2026-10-10", "kal", "Friday", "parso
 * shaam 6 baje", "next week"), read in IST with the Hinglish quick-add
 * parser from Work (step 2). Pure.
 */

export type When = Readonly<{ date: string; time: string | null; label: string }>

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const LEAD = new Set(['by', 'on', 'before', 'at', 'due'])
const TAIL = new Set(['tak', 'ko', 'se', 'pe', 'par'])

function validIso(value: string): boolean {
  const m = ISO.exec(value)
  if (!m) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.getUTCDate() === Number(m[3])
}

/** The date (and time) in `text`, or null when it does not read as a date. Every word must be used. */
export function parseWhen(text: string | null | undefined, now: Date = new Date()): When | null {
  const raw = (text ?? '').trim()
  if (!raw) return null
  const isoPart = raw.slice(0, 10)
  if (validIso(isoPart) && (raw.length === 10 || /^[T ]\d{2}:\d{2}/.test(raw.slice(10)))) {
    const time = raw.length > 10 ? raw.slice(11, 16) : null
    return { date: isoPart, time, label: formatDate(isoPart, { withWeekday: true }) }
  }
  const words = raw.toLowerCase().replace(/[.,;:!?]+/g, ' ').split(/\s+/).filter((w) => w && !LEAD.has(w) && !TAIL.has(w))
  const today = todayIST(now)
  let date: string | null = null
  let time: TimeHit | null = null
  for (let i = 0; i < words.length; ) {
    const d: ReturnType<typeof matchDate> = date ? null : matchDate(words, i, today, { sameDayIsToday: true })
    if (d) {
      date = d.date
      i += d.used
      continue
    }
    const t: ReturnType<typeof matchTime> = time ? null : matchTime(words, i)
    if (t) {
      time = t
      i += t.used
      continue
    }
    return null
  }
  if (time) date = dueDateFor(date, time, now)
  if (!date) return null
  return { date, time: time?.time ?? null, label: formatDate(date, { withWeekday: true }) }
}
