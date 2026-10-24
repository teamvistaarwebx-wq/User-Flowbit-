/**
 * The Google Calendar event for a Flowbit meeting, and how to read a Meet
 * link back. Pure.
 */

export type MeetingForGoogle = Readonly<{
  id: string
  title: string
  agenda?: string | null
  startAt: Date
  endAt: Date
  timezone?: string | null
  location?: string | null
  link?: string | null
  attendeeEmails: readonly string[]
  url: string
}>

export type GoogleEventBody = Record<string, unknown>

/** A unique conference request id per call: Google ignores a repeated one. */
export const conferenceRequestId = (meetingId: string, now: number = Date.now()): string => `flowbit-${meetingId}-${now.toString(36)}`

/**
 * The event body. `withMeet` adds a Google Meet `createRequest` (only when
 * the meeting has no video link of its own and no Meet yet). Insert and
 * patch must send `conferenceDataVersion=1` or Google drops it.
 */
export function eventBody(m: MeetingForGoogle, opts: { withMeet: boolean; requestId?: string }): GoogleEventBody {
  const timeZone = m.timezone || 'Asia/Kolkata'
  const description = [m.agenda?.trim(), m.link ? `Join: ${m.link}` : '', `Open in Flowbit: ${m.url}`].filter(Boolean).join('\n\n')
  const emails = [...new Set(m.attendeeEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  return {
    summary: m.title,
    description,
    start: { dateTime: m.startAt.toISOString(), timeZone },
    end: { dateTime: m.endAt.toISOString(), timeZone },
    attendees: emails.map((email) => ({ email })),
    ...(m.location ? { location: m.location } : {}),
    source: { title: 'Flowbit', url: m.url },
    ...(opts.withMeet ? { conferenceData: { createRequest: { requestId: opts.requestId ?? conferenceRequestId(m.id), conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
  }
}

type EntryPoint = { entryPointType?: string; uri?: string }
export type GoogleEvent = {
  id?: string
  status?: string
  summary?: string
  htmlLink?: string
  hangoutLink?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  conferenceData?: { entryPoints?: EntryPoint[] }
}

/** The Meet (video) link on an event, if Google created one. */
export function meetLinkOf(event: GoogleEvent | null | undefined): string | null {
  if (!event) return null
  if (event.hangoutLink) return event.hangoutLink
  return event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video' && e.uri)?.uri ?? null
}

export type ExternalEvent = Readonly<{ id: string; title: string; startAt: string; endAt: string; href: string | null }>

/** Timed, confirmed events not created by Flowbit, as read-only calendar items. All-day events are left out. */
export function toExternalEvents(events: readonly GoogleEvent[], flowbitIds: ReadonlySet<string>): ExternalEvent[] {
  return events.flatMap((e) => {
    if (!e.id || flowbitIds.has(e.id) || e.status === 'cancelled' || !e.start?.dateTime || !e.end?.dateTime) return []
    return [{ id: e.id, title: e.summary?.trim() || '(No title)', startAt: new Date(e.start.dateTime).toISOString(), endAt: new Date(e.end.dateTime).toISOString(), href: e.htmlLink ?? null }]
  })
}
