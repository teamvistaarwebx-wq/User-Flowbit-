/**
 * A calendar invite (.ics, RFC 5545) for meeting emails, so Gmail, Outlook and
 * Apple Calendar offer "Add to calendar". Pure: times are written in UTC.
 */

export type IcsMethod = 'REQUEST' | 'CANCEL'

export type IcsEvent = Readonly<{
  /** Stable per meeting, so an update or cancel replaces the same calendar entry. */
  uid: string
  title: string
  start: Date
  end: Date
  /** Grows with every change (an update must carry a higher sequence). */
  sequence?: number
  description?: string
  location?: string
  url?: string
  organizer?: Readonly<{ name: string; email: string }>
  method?: IcsMethod
  /** DTSTAMP; defaults to now. */
  stamp?: Date
}>

const CRLF = '\r\n'
const MAX_LINE_OCTETS = 75

/** 20261008T043000Z */
export const icsDate = (at: Date): string => at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Escapes TEXT values: backslash, semicolon, comma and newlines. */
export const icsText = (value: string): string => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Folds a content line at 75 octets (continuation lines start with a space), never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const out: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8')
    const limit = out.length ? MAX_LINE_OCTETS - 1 : MAX_LINE_OCTETS
    if (octets + size > limit) {
      out.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  out.push(current)
  return out.join(`${CRLF} `)
}

const quoteParam = (value: string) => `"${value.replace(/"/g, "'")}"`

/** Builds the .ics text for one event. */
export function buildIcs(event: IcsEvent): string {
  const method = event.method ?? 'REQUEST'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flowbit//Meetings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${Math.max(0, Math.floor(event.sequence ?? 0))}`,
    `DTSTAMP:${icsDate(event.stamp ?? new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.organizer ? [`ORGANIZER;CN=${quoteParam(event.organizer.name)}:mailto:${event.organizer.email}`] : []),
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join(CRLF) + CRLF
}
