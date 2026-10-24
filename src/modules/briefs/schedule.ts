import { addDays, isoDateIST, istInstant, minutesOfDayIST, parseHHMM, weekday } from '@/lib/dates'

/**
 * When a brief goes out (pure, IST). The cron runs every 15 minutes and sends
 * a brief once per day it is due, at the first run after its time. A brief
 * that could not go out within LATE_LIMIT_MINUTES (cron down) is skipped for
 * that day rather than arriving at night.
 */

export const BRIEF_FREQUENCIES = ['daily', 'weekdays', 'weekly', 'monthly'] as const
export type BriefFrequency = (typeof BRIEF_FREQUENCIES)[number]

export type BriefSchedule = Readonly<{
  /** 'HH:MM' IST. */
  time: string
  /** For 'daily': the weekdays it runs on, 0 = Sunday … 6 = Saturday (Mon–Sat by default). */
  days: readonly number[]
  frequency: BriefFrequency
  /** For 'weekly': the weekday it runs on. */
  weekday: number
}>

export const DEFAULT_BRIEF_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6]
export const LATE_LIMIT_MINUTES = 6 * 60
const MAX_LOOKAHEAD_DAYS = 40

/** True when the brief runs on that IST date. */
export function runsOn(schedule: BriefSchedule, date: string): boolean {
  const day = weekday(date)
  if (schedule.frequency === 'weekdays') return day >= 1 && day <= 5
  if (schedule.frequency === 'weekly') return day === schedule.weekday
  if (schedule.frequency === 'monthly') return date.endsWith('-01')
  return schedule.days.includes(day)
}

/**
 * The IST date to send for at `now`, or null: not a run day, too early, too
 * late, or already sent for today (`lastSentFor`).
 */
export function dueDate(schedule: BriefSchedule, lastSentFor: string | null | undefined, now: Date): string | null {
  const today = isoDateIST(now)
  if (lastSentFor === today || !runsOn(schedule, today)) return null
  const late = minutesOfDayIST(now) - parseHHMM(schedule.time)
  return late >= 0 && late <= LATE_LIMIT_MINUTES ? today : null
}

/** The next instant the brief goes out after `now`, or null when it never runs (no days picked). */
export function nextRunAt(schedule: BriefSchedule, now: Date): Date | null {
  const today = isoDateIST(now)
  for (let i = 0; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const date = addDays(today, i)
    const at = istInstant(date, schedule.time)
    if (runsOn(schedule, date) && at.getTime() > now.getTime()) return at
  }
  return null
}

/** A section's content once built: lines with links, or nothing. */
export type BriefLine = Readonly<{ text: string; href?: string; meta?: string }>
export type BuiltSection = Readonly<{ key: string; title: string; lines: readonly BriefLine[]; summary?: string; href?: string }>

export const isEmptyBrief = (sections: readonly BuiltSection[]): boolean => sections.every((s) => s.lines.length === 0)

/** Skip-if-empty: send nothing when every section is empty and the person asked for that. */
export const shouldSendBrief = (sections: readonly BuiltSection[], skipIfEmpty: boolean): boolean => !(skipIfEmpty && isEmptyBrief(sections))

/** The bell line and email preheader: "3 due today · 2 approvals". */
export function briefHeadline(sections: readonly BuiltSection[]): string {
  const parts = sections.filter((s) => s.lines.length).map((s) => s.summary ?? `${s.lines.length} ${s.title.toLowerCase()}`)
  return parts.length ? parts.slice(0, 3).join(' · ') : 'Nothing needs you today.'
}
