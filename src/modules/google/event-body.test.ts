import { describe, expect, it } from 'vitest'
import { conferenceRequestId, eventBody, meetLinkOf, toExternalEvents } from './event-body'
import { GOOGLE_SCOPE, grantedScope } from './scopes'

const meeting = { id: 'm1', title: 'Kickoff', agenda: 'Scope and dates', startAt: new Date('2026-10-12T05:30:00Z'), endAt: new Date('2026-10-12T06:00:00Z'), attendeeEmails: ['A@x.in', 'a@x.in', 'b@x.in'], url: 'https://app/m1' }

describe('Google event body', () => {
  it('adds a Meet create request with the given request id and de-duplicated attendees', () => {
    const body = eventBody(meeting, { withMeet: true, requestId: 'req-1' }) as { conferenceData?: unknown; attendees?: unknown; start?: unknown; description?: string }
    expect(body.conferenceData).toEqual({ createRequest: { requestId: 'req-1', conferenceSolutionKey: { type: 'hangoutsMeet' } } })
    expect(body.attendees).toEqual([{ email: 'a@x.in' }, { email: 'b@x.in' }])
    expect(body.start).toEqual({ dateTime: '2026-10-12T05:30:00.000Z', timeZone: 'Asia/Kolkata' })
    expect(body.description).toContain('Open in Flowbit: https://app/m1')
  })

  it('leaves the conference alone when the meeting has its own link', () => {
    const body = eventBody({ ...meeting, link: 'https://zoom.us/j/1' }, { withMeet: false })
    expect(body).not.toHaveProperty('conferenceData')
    expect(String(body.description)).toContain('Join: https://zoom.us/j/1')
  })

  it('makes a new request id each time', () => {
    expect(conferenceRequestId('m1', 1)).not.toBe(conferenceRequestId('m1', 2))
  })

  it('reads the Meet link from hangoutLink or the video entry point', () => {
    expect(meetLinkOf({ hangoutLink: 'https://meet.google.com/a' })).toBe('https://meet.google.com/a')
    expect(meetLinkOf({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }, { entryPointType: 'video', uri: 'https://meet.google.com/b' }] } })).toBe('https://meet.google.com/b')
    expect(meetLinkOf({})).toBeNull()
  })

  it("keeps the user's own timed events and drops Flowbit's, cancelled and all-day ones", () => {
    const out = toExternalEvents(
      [
        { id: 'own', summary: 'Dentist', start: { dateTime: '2026-10-12T10:00:00+05:30' }, end: { dateTime: '2026-10-12T11:00:00+05:30' }, htmlLink: 'https://cal/own' },
        { id: 'fb', summary: 'Kickoff', start: { dateTime: '2026-10-12T11:00:00+05:30' }, end: { dateTime: '2026-10-12T12:00:00+05:30' } },
        { id: 'gone', status: 'cancelled', start: { dateTime: '2026-10-12T11:00:00+05:30' }, end: { dateTime: '2026-10-12T12:00:00+05:30' } },
        { id: 'day', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } },
      ],
      new Set(['fb']),
    )
    expect(out).toEqual([{ id: 'own', title: 'Dentist', startAt: '2026-10-12T04:30:00.000Z', endAt: '2026-10-12T05:30:00.000Z', href: 'https://cal/own' }])
  })
})

describe('Google scopes', () => {
  it('asks for one narrow scope per service', () => {
    expect(GOOGLE_SCOPE).toEqual({ calendar: 'https://www.googleapis.com/auth/calendar.events', gmail: 'https://www.googleapis.com/auth/gmail.send', gmail_read: 'https://www.googleapis.com/auth/gmail.readonly' })
    expect(grantedScope('openid https://www.googleapis.com/auth/calendar.events', 'calendar')).toBe(true)
    expect(grantedScope('https://www.googleapis.com/auth/calendar.events.readonly', 'calendar')).toBe(false)
  })
})
