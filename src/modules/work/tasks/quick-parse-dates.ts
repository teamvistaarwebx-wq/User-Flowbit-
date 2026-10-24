import { addDays, minutesOfDayIST, startOfWeek, todayIST, weekday } from '@/lib/dates'

/**
 * Dates and times in a quick-add title, in English and Hinglish (pure, client-safe, IST).
 * Each matcher looks at the words from `i` and returns how many it used, or null.
 */

export type DateHit = { used: number; date: string }
/** `nextDay`: a night time after midnight ("kal raat 1 baje" is the small hours after tomorrow). */
export type TimeHit = { used: number; time: string; nextDay?: boolean }

const RELATIVE: Record<string, number> = { aaj: 0, today: 0, kal: 1, tomorrow: 1, tmrw: 1, tmr: 1, parso: 2, parson: 2, parsoon: 2 }

/** Weekday words → 0 (Sunday) … 6 (Saturday). */
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, ravivar: 0, itvaar: 0, itwar: 0,
  mon: 1, monday: 1, somvar: 1, somwar: 1,
  tue: 2, tues: 2, tuesday: 2, mangal: 2, mangalvar: 2, mangalwar: 2,
  wed: 3, wednesday: 3, budh: 3, budhvar: 3, budhwar: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, guru: 4, guruvar: 4, guruwar: 4,
  fri: 5, friday: 5, shukra: 5, shukravar: 5, shukrawar: 5,
  sat: 6, saturday: 6, shani: 6, shanivar: 6, shaniwar: 6,
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

const NEXT_WORDS = new Set(['next', 'agle', 'agla', 'agli'])
/**
 * Short weekday words that are also everyday words ("baat sun lo", "guru ko call karo"):
 * they count as a weekday only after "agle"/"next". The full forms (sunday, guruvar) work alone.
 */
const AMBIGUOUS_WEEKDAYS = new Set(['sun', 'guru', 'mangal', 'shani'])
/** "by friday" / "friday tak": a deadline, so on a Friday it still means today. */
const DEADLINE_WORDS = new Set(['by', 'before', 'tak'])
const WEEK_WORDS = new Set(['week', 'hafte', 'hafta', 'saptah'])

/** Parts of the day: default hour, and whether a bare hour is pm. */
const DAY_PARTS: Record<string, { hour: number; pm: boolean }> = {
  subah: { hour: 9, pm: false }, subha: { hour: 9, pm: false }, morning: { hour: 9, pm: false },
  dopahar: { hour: 14, pm: true }, dopehar: { hour: 14, pm: true }, afternoon: { hour: 14, pm: true },
  shaam: { hour: 18, pm: true }, sham: { hour: 18, pm: true }, evening: { hour: 18, pm: true },
  raat: { hour: 21, pm: true }, night: { hour: 21, pm: true }, tonight: { hour: 21, pm: true },
}

const isDayPart = (w: string | undefined): w is string => w !== undefined && Object.hasOwn(DAY_PARTS, w)

/** A bare "5 baje": 1–7 reads as evening (office hours), 8–11 as morning. */
const LATEST_BARE_PM_HOUR = 7

/** Night words: "raat 12 baje" is midnight and "raat 1–4 baje" the small hours, both after that day. */
const NIGHT_WORDS = new Set(['raat', 'night', 'tonight'])
const LATEST_SMALL_HOUR = 4
const MIDNIGHT = 'midnight'

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`

/**
 * The next `target` weekday; with `nextWeek`, that weekday in the following week. Today's own
 * weekday means a week from today ("aaj" says today), except as a deadline ("by friday" on a Friday).
 */
function weekdayDate(today: string, target: number, nextWeek: boolean, deadline = false): string {
  if (nextWeek) {
    const monday = addDays(startOfWeek(today), 7)
    return addDays(monday, target === 0 ? 6 : target - 1)
  }
  const diff = (target - weekday(today) + 7) % 7
  return addDays(today, diff === 0 && !deadline ? 7 : diff)
}

/** Day and month to the next such date on or after today (this year, else next year). */
function dayMonthDate(today: string, day: number, month: number): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const year = Number(today.slice(0, 4))
  for (const y of [year, year + 1]) {
    const iso = `${y}-${pad(month)}-${pad(day)}`
    const check = new Date(`${iso}T00:00:00Z`)
    if (check.getUTCDate() !== day) return null
    if (iso >= today) return iso
  }
  return null
}

/** `sameDayIsToday`: a weekday typed on that day means today (MCP dates, where the AI states a deadline). */
export function matchDate(words: string[], i: number, today: string, opts: { sameDayIsToday?: boolean } = {}): DateHit | null {
  const w = words[i]
  const next = words[i + 1]
  if (w in RELATIVE) return { used: 1, date: addDays(today, RELATIVE[w]) }
  if (w === 'day' && next === 'after' && words[i + 2] === 'tomorrow') return { used: 3, date: addDays(today, 2) }
  if (NEXT_WORDS.has(w) && next !== undefined) {
    if (next in WEEKDAYS) return { used: 2, date: weekdayDate(today, WEEKDAYS[next], true) }
    if (WEEK_WORDS.has(next)) return { used: 2, date: addDays(startOfWeek(today), 7) }
  }
  if (w in WEEKDAYS && !AMBIGUOUS_WEEKDAYS.has(w)) return { used: 1, date: weekdayDate(today, WEEKDAYS[w], false, Boolean(opts.sameDayIsToday) || DEADLINE_WORDS.has(words[i - 1] ?? '') || DEADLINE_WORDS.has(next ?? '')) }
  if (w === 'in' && /^\d{1,3}$/.test(next ?? '') && ['day', 'days', 'din'].includes(words[i + 2] ?? '')) return { used: 3, date: addDays(today, Number(next)) }
  if (/^\d{1,3}$/.test(w) && next === 'din' && ['mein', 'me', 'main', 'baad'].includes(words[i + 2] ?? '')) return { used: 3, date: addDays(today, Number(w)) }
  const dayFirst = /^(\d{1,2})(st|nd|rd|th)?$/.exec(w)
  if (dayFirst && next !== undefined && next in MONTHS) {
    const date = dayMonthDate(today, Number(dayFirst[1]), MONTHS[next])
    return date ? { used: 2, date } : null
  }
  const monthFirst = next !== undefined ? /^(\d{1,2})(st|nd|rd|th)?$/.exec(next) : null
  if (w in MONTHS && monthFirst) {
    const date = dayMonthDate(today, Number(monthFirst[1]), MONTHS[w])
    return date ? { used: 2, date } : null
  }
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(w)
  if (slash) {
    const date = dayMonthDate(today, Number(slash[1]), Number(slash[2]))
    return date ? { used: 1, date } : null
  }
  return null
}

/** "5pm", "5:30 pm", "17:00", "5 baje", "shaam 6 baje", "subah", "6 baje shaam", "raat 1 baje", "midnight". */
export function matchTime(words: string[], i: number): TimeHit | null {
  if (words[i] === MIDNIGHT) return { used: 1, time: hhmm(0, 0), nextDay: true }
  if (words[i] === '12' && words[i + 1] === MIDNIGHT) return { used: 2, time: hhmm(0, 0), nextDay: true }
  const partWord = isDayPart(words[i]) ? words[i] : null
  const start = partWord ? i + 1 : i
  const clock = matchClock(words, start)
  if (partWord && !clock) return { used: 1, time: hhmm(DAY_PARTS[partWord].hour, 0) }
  if (!clock) return null
  const afterWord = words[start + clock.used]
  if (!partWord && afterWord === MIDNIGHT && clock.hour === 12 && clock.meridiem !== 'pm') {
    return { used: clock.used + 1, time: hhmm(0, clock.minute), nextDay: true }
  }
  const contextWord = partWord ?? (isDayPart(afterWord) ? afterWord : null)
  const used = clock.used + (contextWord ? 1 : 0)
  const isNight = contextWord !== null && NIGHT_WORDS.has(contextWord)
  const hour = isNight ? nightHour(clock) : dayHour(clock, contextWord ? DAY_PARTS[contextWord] : undefined)
  const time = hhmm(hour, clock.minute)
  return isNight && hour <= LATEST_SMALL_HOUR ? { used, time, nextDay: true } : { used, time }
}

function dayHour(clock: Clock, context: { pm: boolean } | undefined): number {
  const { hour, meridiem } = clock
  if (meridiem === 'pm') return hour < 12 ? hour + 12 : hour
  if (meridiem === 'am') return hour === 12 ? 0 : hour
  if (hour >= 12) return hour
  const pm = context ? context.pm : clock.bare && hour >= 1 && hour <= LATEST_BARE_PM_HOUR
  return pm ? hour + 12 : hour
}

/** With raat/night and no am/pm: 12 is midnight, 1–4 the small hours, 5–11 the evening. */
function nightHour(clock: Clock): number {
  if (clock.meridiem) return dayHour(clock, undefined)
  if (clock.hour === 12) return 0
  if (clock.hour <= LATEST_SMALL_HOUR) return clock.hour
  return dayHour(clock, { pm: true })
}

type Clock = { used: number; hour: number; minute: number; meridiem: 'am' | 'pm' | null; bare: boolean }

function matchClock(words: string[], i: number): Clock | null {
  const w = words[i]
  if (w === undefined) return null
  const glued = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(w)
  if (glued) return clockOf(1, glued[1], glued[2], glued[3] as 'am' | 'pm', false)
  const plain = /^(\d{1,2})(?::(\d{2}))?$/.exec(w)
  if (!plain) return null
  const next = words[i + 1]
  if (next === 'am' || next === 'pm') return clockOf(2, plain[1], plain[2], next, false)
  if (next === 'baje' || next === 'bje' || next === "o'clock") return clockOf(2, plain[1], plain[2], null, true)
  // "17:00" on its own is a clock time; a bare "5" is not (it may be a quantity).
  if (plain[2] !== undefined) return clockOf(1, plain[1], plain[2], null, false)
  return null
}

function clockOf(used: number, h: string, m: string | undefined, meridiem: 'am' | 'pm' | null, bare: boolean): Clock | null {
  const hour = Number(h)
  const minute = m ? Number(m) : 0
  if (hour > 23 || minute > 59 || (meridiem && (hour < 1 || hour > 12))) return null
  return { used, hour, minute, meridiem, bare }
}

/**
 * The due date for a time: with no date, the next time it comes round (IST); with a date
 * and a night time after midnight ("kal raat 1 baje"), the day after that date.
 */
export function dueDateFor(date: string | null | undefined, time: TimeHit, now: Date): string {
  if (!date) return dateForTime(time.time, now)
  return time.nextDay ? addDays(date, 1) : date
}

/** A time with no date: today if it is still ahead (IST), else tomorrow. */
export function dateForTime(time: string, now: Date): string {
  const today = todayIST(now)
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m > minutesOfDayIST(now) ? today : addDays(today, 1)
}
