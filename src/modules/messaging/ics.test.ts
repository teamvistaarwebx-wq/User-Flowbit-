import { describe, expect, it } from 'vitest'
import { buildIcs, foldLine, icsDate, icsText } from './ics'

const event = {
  uid: 'meeting-64b7@useflowbit.com',
  title: 'Weekly sync; budget, hiring',
  start: new Date('2026-10-09T05:30:00Z'),
  end: new Date('2026-10-09T06:00:00Z'),
  stamp: new Date('2026-10-08T05:00:00Z'),
  sequence: 2,
  description: 'Agenda:\nBudget',
  location: 'Room 2',
  url: 'https://app.useflowbit.com/app/work/meetings/64b7',
  organizer: { name: 'Asha "Ops" Rao', email: 'asha@example.in' },
}

describe('buildIcs', () => {
  it('writes a REQUEST with UTC times, escaped text and CRLF line endings', () => {
    const ics = buildIcs(event)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('METHOD:REQUEST\r\n')
    expect(ics).toContain('DTSTART:20261009T053000Z\r\n')
    expect(ics).toContain('DTEND:20261009T060000Z\r\n')
    expect(ics).toContain('SUMMARY:Weekly sync\\; budget\\, hiring\r\n')
    expect(ics).toContain('DESCRIPTION:Agenda:\\nBudget\r\n')
    expect(ics).toContain('SEQUENCE:2\r\n')
    expect(ics).toContain('STATUS:CONFIRMED')
    expect(ics).toContain(`ORGANIZER;CN="Asha 'Ops' Rao":mailto:asha@example.in`)
    expect(ics.split('\r\n').filter((l) => l === '').length).toBe(1)
  })

  it('writes a CANCEL for a cancelled meeting', () => {
    const ics = buildIcs({ ...event, method: 'CANCEL' })
    expect(ics).toContain('METHOD:CANCEL')
    expect(ics).toContain('STATUS:CANCELLED')
  })

  it('leaves out optional fields that are not set', () => {
    const ics = buildIcs({ uid: 'u', title: 'Call', start: event.start, end: event.end })
    expect(ics).not.toContain('LOCATION')
    expect(ics).not.toContain('ORGANIZER')
    expect(ics).toContain('SEQUENCE:0')
  })
})

describe('ics helpers', () => {
  it('formats dates in basic UTC form', () => {
    expect(icsDate(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z')
  })

  it('escapes backslashes first', () => {
    expect(icsText('a\\b;c')).toBe('a\\\\b\\;c')
  })

  it('folds long lines at 75 octets without splitting characters', () => {
    const long = `SUMMARY:${'मीटिंग '.repeat(20)}`
    const folded = foldLine(long)
    const lines = folded.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    lines.forEach((line) => expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75))
    expect(lines.slice(1).every((l) => l.startsWith(' '))).toBe(true)
    expect(lines.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long)
  })
})
