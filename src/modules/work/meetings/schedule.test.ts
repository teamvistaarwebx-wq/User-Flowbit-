import { describe, expect, it } from 'vitest'
import { blockPosition, meetingFormValues, meetingTimes, mergeAttendees, rsvpSummary } from './schedule'

describe('meetingTimes', () => {
  it('reads IST wall-clock times', () => {
    const r = meetingTimes('2026-10-03', '11:00', '11:30')
    expect('startAt' in r && r.startAt.toISOString()).toBe('2026-10-03T05:30:00.000Z')
  })
  it('refuses end before start and over 12 hours', () => {
    expect(meetingTimes('2026-10-03', '11:00', '10:00')).toEqual({ field: 'end', error: 'End time must be after start time' })
    expect(meetingTimes('2026-10-03', '08:00', '20:30')).toEqual({ field: 'end', error: 'Meetings can be at most 12 hours long' })
  })
  it('round-trips into form values', () => {
    const r = meetingTimes('2026-10-03', '09:15', '10:45')
    if (!('startAt' in r)) throw new Error('expected times')
    expect(meetingFormValues(r.startAt, r.endAt)).toEqual({ date: '2026-10-03', start: '09:15', end: '10:45' })
  })
})

describe('rsvpSummary', () => {
  it('counts each answer', () => {
    expect(rsvpSummary([{ rsvp: 'accepted' }, { rsvp: 'accepted' }, { rsvp: 'tentative' }, { rsvp: 'pending' }])).toBe('2 going, 1 maybe, 1 no reply')
  })
})

describe('mergeAttendees', () => {
  it('keeps RSVPs of people who stay and adds new people as pending', () => {
    const at = new Date('2026-10-01T05:00:00Z')
    const out = mergeAttendees([{ memberId: 'o', rsvp: 'accepted', respondedAt: at }, { memberId: 'a', rsvp: 'declined', respondedAt: at }, { memberId: 'b', rsvp: 'accepted', respondedAt: at }], ['a', 'c'], 'o')
    expect(out.map((x) => [x.memberId, x.rsvp])).toEqual([['o', 'accepted'], ['a', 'declined'], ['c', 'pending']])
  })

  it('asks everyone again when the meeting moves to a new time', () => {
    const at = new Date('2026-10-01T05:00:00Z')
    const out = mergeAttendees([{ memberId: 'o', rsvp: 'accepted', respondedAt: at }, { memberId: 'a', rsvp: 'declined', respondedAt: at }], ['a'], 'o', true)
    expect(out.map((x) => [x.memberId, x.rsvp])).toEqual([['o', 'accepted'], ['a', 'pending']])
  })
})

describe('blockPosition', () => {
  it('places a block inside the 8:00–21:00 window', () => {
    const r = meetingTimes('2026-10-03', '08:00', '09:18')
    if (!('startAt' in r)) throw new Error('expected times')
    const pos = blockPosition(r.startAt, r.endAt)
    expect(pos.top).toBe(0)
    expect(Math.round(pos.height)).toBe(10)
  })
})
