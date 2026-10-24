import { isoDateIST, istInstant, minutesOfDayIST } from '@/lib/dates'
import type { Rsvp } from '@/models/work/Meeting'

export const MAX_MEETING_MINUTES = 12 * 60
/** Week calendar shows 8:00 to 21:00 IST. */
export const DAY_START_MIN = 8 * 60
export const DAY_END_MIN = 21 * 60

/** IST date + 'HH:MM' start/end -> instants, or a field error. */
export function meetingTimes(date: string, start: string, end: string): { startAt: Date; endAt: Date } | { field: 'end'; error: string } {
  const startAt = istInstant(date, start)
  const endAt = istInstant(date, end)
  const minutes = (endAt.getTime() - startAt.getTime()) / 60_000
  if (minutes <= 0) return { field: 'end', error: 'End time must be after start time' }
  if (minutes > MAX_MEETING_MINUTES) return { field: 'end', error: 'Meetings can be at most 12 hours long' }
  return { startAt, endAt }
}

const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/** Form defaults from stored instants. */
export function meetingFormValues(startAt: Date | string, endAt: Date | string) {
  const s = new Date(startAt)
  const e = new Date(endAt)
  return { date: isoDateIST(s), start: hhmm(minutesOfDayIST(s)), end: hhmm(minutesOfDayIST(e)) }
}

export type RsvpLike = { rsvp: string }

/** "4 going, 1 maybe, 2 no reply" (declines included when present). */
export function rsvpSummary(attendees: RsvpLike[]): string {
  const count = (s: string) => attendees.filter((a) => a.rsvp === s).length
  const parts = [`${count('accepted')} going`]
  if (count('tentative')) parts.push(`${count('tentative')} maybe`)
  if (count('declined')) parts.push(`${count('declined')} declined`)
  if (count('pending')) parts.push(`${count('pending')} no reply`)
  return parts.join(', ')
}

type AttendeeRow = { memberId: string; rsvp: Rsvp; respondedAt?: Date }

/**
 * Attendees after an edit: people who stay keep their RSVP, new people start
 * pending, the organiser is always in and accepted.
 */
export function mergeAttendees(existing: { memberId: string; rsvp: Rsvp; respondedAt?: Date | null }[], nextIds: string[], organizerId: string, resetRsvp = false): AttendeeRow[] {
  const ids = [...new Set([organizerId, ...nextIds])]
  return ids.map((id): AttendeeRow => {
    const prior = existing.find((a) => a.memberId === id)
    if (id === organizerId) return { memberId: id, rsvp: 'accepted', respondedAt: prior?.respondedAt ?? new Date() }
    // A new time is a new question: earlier answers were for the old slot.
    return prior && !resetRsvp ? { memberId: id, rsvp: prior.rsvp, respondedAt: prior.respondedAt ?? undefined } : { memberId: id, rsvp: 'pending' }
  })
}

/** Vertical placement (percent of the visible day) for the week calendar. */
export function blockPosition(startAt: Date | string, endAt: Date | string): { top: number; height: number } {
  const span = DAY_END_MIN - DAY_START_MIN
  const clamp = (m: number) => Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, m))
  const s = clamp(minutesOfDayIST(new Date(startAt)))
  const e = clamp(Math.max(minutesOfDayIST(new Date(endAt)), s + 15))
  return { top: ((s - DAY_START_MIN) / span) * 100, height: Math.max(((e - s) / span) * 100, 3) }
}
