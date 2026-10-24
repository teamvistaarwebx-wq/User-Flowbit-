import { computeDay, type Punch } from '@/lib/attendance-core'
import { BREAK_LABEL, type BreakKey } from '@/lib/break-types'

/** Where someone is today, from Muster attendance and leave (pure, client-safe). */
export type PresenceState = 'in' | 'break' | 'leave' | 'out'
export type Presence = { state: PresenceState; breakType?: BreakKey | null }

/** Day marks that mean the person is away all day. */
const LEAVE_MARKS = new Set(['leave', 'sick_leave'])

/** Approved leave (or a leave mark on the day) wins; otherwise the punches say in, on break or out. */
export function presenceFrom(day: { punches?: readonly Punch[] | null; status?: string | null } | null | undefined, onLeave: boolean, now: Date = new Date()): Presence {
  if (onLeave || (day?.status && LEAVE_MARKS.has(day.status) && !(day.punches ?? []).length)) return { state: 'leave' }
  if (!day || !(day.punches ?? []).length) return { state: 'out' }
  const result = computeDay({ punches: day.punches ?? [], status: day.status }, undefined, now)
  if (result.state === 'break') return { state: 'break', breakType: result.breakType }
  return { state: result.state === 'in' ? 'in' : 'out' }
}

export const PRESENCE_LABEL: Record<PresenceState, string> = { in: 'Checked in', break: 'On break', leave: 'On leave', out: 'Offline' }

/** "On break · Lunch Break", "On leave", … */
export function presenceText(p: Presence): string {
  if (p.state === 'break') return `${PRESENCE_LABEL.break}${p.breakType ? ` · ${BREAK_LABEL[p.breakType]}` : ''}`
  return PRESENCE_LABEL[p.state]
}

/** Is `date` one of the person's leave days? */
export const onLeaveOn = (leaveDates: readonly string[] | undefined, date: string | null | undefined): boolean => Boolean(date && leaveDates?.includes(date))

/** People among `ids` who are on leave on `date`, by name, for a non-blocking warning. */
export function leaveWarning(people: readonly { id: string; name: string; leaveDates?: readonly string[] }[], ids: readonly string[], date: string | null | undefined): string | null {
  if (!date) return null
  const away = people.filter((p) => ids.includes(p.id) && onLeaveOn(p.leaveDates, date)).map((p) => p.name)
  if (!away.length) return null
  return `${away.join(', ')} ${away.length === 1 ? 'is' : 'are'} on leave that day`
}
