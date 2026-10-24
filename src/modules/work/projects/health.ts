import { daysBetween } from '@/lib/dates'
import type { ProjectHealth } from './constants'

/**
 * Project progress, health and timeline (pure). Counts come from the project's
 * top-level, non-personal tasks.
 */

export type ProjectCounts = { total: number; completed: number; inProgress: number; blocked: number; overdue: number }
export type ProjectDates = { startDate?: string | null; endDate?: string | null }

export const EMPTY_COUNTS: ProjectCounts = { total: 0, completed: 0, inProgress: 0, blocked: 0, overdue: 0 }

const NEUTRAL_SCORE = 75
const SCHEDULE_SLACK = 10
const SCHEDULE_SPAN = 50

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** Completion % (the progress ring). */
export const completion = (c: ProjectCounts) => pct(c.completed, c.total)

/** Share of the project's time used (0-100), or null without both dates. */
export function timeElapsed(dates: ProjectDates, today: string): number | null {
  if (!dates.startDate || !dates.endDate) return null
  const span = daysBetween(dates.startDate, dates.endDate)
  if (span <= 0) return today >= dates.endDate ? 100 : 0
  return clamp(Math.round((daysBetween(dates.startDate, today) / span) * 100), 0, 100)
}

/**
 * Health score out of 100: completion 40 + on time 30 + not blocked 20 +
 * schedule 10. Done and not-yet-due tasks both count as on time, so a
 * finished project scores 100 (the reference scored it 70).
 */
export function healthScore(c: ProjectCounts, dates: ProjectDates, today: string): number {
  if (c.total === 0) return NEUTRAL_SCORE
  const done = (c.completed / c.total) * 40
  const onTime = ((c.total - c.overdue) / c.total) * 30
  const unblocked = ((c.total - c.blocked) / c.total) * 20
  const elapsed = dates.endDate ? timeElapsed(dates, today) : null
  const progress = completion(c)
  const behind = elapsed == null ? 0 : elapsed - SCHEDULE_SLACK - progress
  const schedule = 10 * (behind <= 0 ? 1 : Math.max(0, 1 - behind / SCHEDULE_SPAN))
  return clamp(Math.round(done + onTime + unblocked + schedule), 0, 100)
}

export const healthLevel = (score: number): ProjectHealth => (score >= 80 ? 'on_track' : score >= 60 ? 'at_risk' : 'off_track')

export function projectHealth(c: ProjectCounts, dates: ProjectDates, today: string): { score: number; health: ProjectHealth } {
  const score = healthScore(c, dates, today)
  return { score, health: c.total === 0 ? 'on_track' : healthLevel(score) }
}

/** "12 days left" / "5 days over" / null. */
export function timelineSummary(dates: ProjectDates, today: string): { elapsed: number; daysLeft: number; label: string } | null {
  const elapsed = timeElapsed(dates, today)
  if (elapsed == null || !dates.endDate) return null
  const daysLeft = daysBetween(today, dates.endDate)
  const label = daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? '1 day left' : daysLeft === 0 ? 'Due today' : `${-daysLeft} day${daysLeft === -1 ? '' : 's'} over`
  return { elapsed, daysLeft, label }
}

/** The health drivers in words: "3 overdue tasks", "1 blocked", "40% of time used, 55% done". */
export function healthDrivers(c: ProjectCounts, dates: ProjectDates, today: string): string[] {
  const out: string[] = []
  out.push(c.overdue ? `${c.overdue} overdue task${c.overdue === 1 ? '' : 's'}` : 'Nothing overdue')
  out.push(c.blocked ? `${c.blocked} blocked` : 'Nothing blocked')
  const elapsed = timeElapsed(dates, today)
  if (elapsed != null) out.push(`${elapsed}% of time used, ${completion(c)}% done`)
  return out
}

/** Ring segments for Home and Overview: done / in progress / blocked as % of total. */
export function ringShares(c: ProjectCounts): { done: number; inProgress: number; blocked: number } {
  return { done: pct(c.completed, c.total), inProgress: pct(c.inProgress, c.total), blocked: pct(c.blocked, c.total) }
}
