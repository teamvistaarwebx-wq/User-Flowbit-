import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ appUrl: (p = '') => `https://app.test${p}` }))
vi.mock('@/models/work/Meeting', () => ({ Meeting: {} }))
const google = { insertEvent: vi.fn(), patchEvent: vi.fn(), cancelEvent: vi.fn(), listEvents: vi.fn() }
vi.mock('@/modules/google/client', () => ({
  insertEvent: (...a: unknown[]) => google.insertEvent(...a),
  patchEvent: (...a: unknown[]) => google.patchEvent(...a),
  cancelEvent: (...a: unknown[]) => google.cancelEvent(...a),
  listEvents: (...a: unknown[]) => google.listEvents(...a),
}))
const tokens: Record<string, string | null> = {}
vi.mock('@/modules/google/connections', () => ({ accessTokenFor: async (_s: unknown, memberId: unknown) => tokens[String(memberId)] ?? null }))
vi.mock('../teams/people', () => ({ listPeople: async (_c: unknown, ids: string[]) => ids.map((id) => ({ id, email: `${id}@team.in` })) }))

type Doc = Record<string, unknown>
function fakeCtx(meeting: Doc) {
  const updates: Doc[] = []
  const model = {
    findOne: () => ({ lean: async () => meeting }),
    updateOne: async (_f: unknown, u: Doc) => void updates.push(u),
    distinct: async () => ['flowbit-ev'],
  }
  return { updates, ctx: { memberId: 'org1', db: () => model } as never }
}

const base = { _id: 'm1', title: 'Kickoff', agenda: 'Plan', startAt: new Date('2026-10-12T05:30:00Z'), endAt: new Date('2026-10-12T06:00:00Z'), organizerId: 'org1', attendees: [{ memberId: 'org1' }, { memberId: 'a1' }], link: '' }

describe('meeting → Google Calendar', () => {
  beforeEach(() => {
    Object.values(google).forEach((f) => f.mockReset())
    for (const k of Object.keys(tokens)) delete tokens[k]
  })

  it('does nothing when the organiser has not connected Google Calendar', async () => {
    const { syncMeetingToGoogle } = await import('./google-sync')
    const { ctx, updates } = fakeCtx(base)
    await expect(syncMeetingToGoogle(ctx, 'm1')).resolves.toEqual({ synced: false, meetLink: null })
    expect(google.insertEvent).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('creates the event with a Meet request and stores the event id and Meet link', async () => {
    tokens.org1 = 'tok'
    google.insertEvent.mockResolvedValue({ id: 'ev1', hangoutLink: 'https://meet.google.com/x' })
    const { syncMeetingToGoogle } = await import('./google-sync')
    const { ctx, updates } = fakeCtx(base)
    await expect(syncMeetingToGoogle(ctx, 'm1')).resolves.toEqual({ synced: true, meetLink: 'https://meet.google.com/x' })
    const body = google.insertEvent.mock.calls[0][1]
    expect(body.conferenceData.createRequest.requestId).toMatch(/^flowbit-m1-/)
    expect(body.attendees).toEqual([{ email: 'a1@team.in' }])
    expect(updates[0]).toMatchObject({ $set: { 'google.eventId': 'ev1', 'google.meetLink': 'https://meet.google.com/x', link: 'https://meet.google.com/x' } })
  })

  it("updates the organiser's existing event without a second Meet request", async () => {
    tokens.org1 = 'tok'
    google.patchEvent.mockResolvedValue({ id: 'ev1' })
    const { syncMeetingToGoogle } = await import('./google-sync')
    const { ctx } = fakeCtx({ ...base, link: 'https://meet.google.com/x', google: { eventId: 'ev1', memberId: 'org1', meetLink: 'https://meet.google.com/x' } })
    await syncMeetingToGoogle(ctx, 'm1')
    expect(google.patchEvent).toHaveBeenCalledWith('tok', 'ev1', expect.not.objectContaining({ conferenceData: expect.anything() }))
  })

  it('keeps the meeting when Google fails, and records the error', async () => {
    tokens.org1 = 'tok'
    google.insertEvent.mockRejectedValue(new Error('Google Calendar insert failed (500)'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { syncMeetingToGoogle } = await import('./google-sync')
    const { ctx, updates } = fakeCtx(base)
    await expect(syncMeetingToGoogle(ctx, 'm1')).resolves.toEqual({ synced: false, meetLink: null })
    err.mockRestore()
    expect(updates[0]).toEqual({ $set: { 'google.error': 'Google Calendar insert failed (500)' } })
  })

  it('cancels the Google event when the meeting is cancelled', async () => {
    tokens.org1 = 'tok'
    const { cancelGoogleEvent } = await import('./google-sync')
    const { ctx } = fakeCtx({ ...base, google: { eventId: 'ev1', memberId: 'org1' } })
    await expect(cancelGoogleEvent(ctx, 'm1')).resolves.toBe(true)
    expect(google.cancelEvent).toHaveBeenCalledWith('tok', 'ev1')
  })

  it("imports the viewer's own events but not the ones Flowbit made", async () => {
    tokens.org1 = 'tok'
    google.listEvents.mockResolvedValue([
      { id: 'flowbit-ev', summary: 'Kickoff', start: { dateTime: '2026-10-12T11:00:00+05:30' }, end: { dateTime: '2026-10-12T12:00:00+05:30' } },
      { id: 'mine', summary: 'Gym', start: { dateTime: '2026-10-12T19:00:00+05:30' }, end: { dateTime: '2026-10-12T20:00:00+05:30' } },
    ])
    const { externalEvents } = await import('./google-sync')
    const { ctx } = fakeCtx(base)
    const out = await externalEvents(ctx, new Date('2026-10-12T00:00:00Z'), new Date('2026-10-19T00:00:00Z'))
    expect(out.map((e) => e.title)).toEqual(['Gym'])
  })
})
