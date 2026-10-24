import 'server-only'
import { SITE_DOMAIN } from '@/lib/company'
import { formatDate, formatTime } from '@/lib/dates'
import { appUrl } from '@/lib/env'
import type { NotifyInput } from '@/lib/notify'
import { buildIcs, type IcsMethod } from '@/modules/messaging/ics'

/**
 * The email extras for a meeting alert: when and where, plus an .ics file so
 * the invite lands in the attendee's calendar (and a cancel removes it).
 */

export type InviteMeeting = Readonly<{ _id: unknown; title: string; startAt: Date; endAt: Date; agenda?: string | null; location?: string | null; link?: string | null }>

export function meetingEmail(meeting: InviteMeeting, organizer: { name: string; email: string }, method: IcsMethod = 'REQUEST'): NonNullable<NotifyInput['email']> {
  const id = String(meeting._id)
  const url = appUrl(`/app/work/meetings/${id}`)
  const ics = buildIcs({
    uid: `meeting-${id}@${SITE_DOMAIN}`,
    // Seconds since epoch only grows, so every update or cancel replaces the earlier calendar entry.
    sequence: Math.floor(Date.now() / 1000) - 1_700_000_000,
    title: meeting.title,
    start: new Date(meeting.startAt),
    end: new Date(meeting.endAt),
    description: [meeting.agenda, meeting.link ? `Join: ${meeting.link}` : null, url].filter(Boolean).join('\n\n'),
    location: meeting.location || meeting.link || undefined,
    url,
    organizer,
    method,
  })
  const when = `${formatDate(meeting.startAt, { withWeekday: true })}, ${formatTime(meeting.startAt)} to ${formatTime(meeting.endAt)} (IST)`
  return {
    paragraphs: [when, ...(meeting.location ? [`Where: ${meeting.location}`] : []), ...(meeting.link ? [`Join: ${meeting.link}`] : [])],
    attachments: [{ filename: method === 'CANCEL' ? 'cancelled.ics' : 'invite.ics', content: Buffer.from(ics, 'utf8'), mime: `text/calendar; charset=utf-8; method=${method}` }],
  }
}
