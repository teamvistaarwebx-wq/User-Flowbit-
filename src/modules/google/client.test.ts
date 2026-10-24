import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const fetchMock = vi.fn()
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

describe('Google client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('creates events with conferenceDataVersion=1 so Google adds the Meet link', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'ev1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }))
    const { insertEvent } = await import('./client')
    const body = { summary: 'Kickoff', conferenceData: { createRequest: { requestId: 'r1', conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
    const event = await insertEvent('tok', body)
    const [url, init] = fetchMock.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(parsed.searchParams.get('conferenceDataVersion')).toBe('1')
    expect(parsed.searchParams.get('sendUpdates')).toBe('none')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body).conferenceData.createRequest.requestId).toBe('r1')
    expect(event.id).toBe('ev1')
  })

  it('updates events with conferenceDataVersion=1 too', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'ev1' }))
    const { patchEvent } = await import('./client')
    await patchEvent('tok', 'ev/1', { summary: 'Moved' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/events/ev%2F1?')
    expect(new URL(url).searchParams.get('conferenceDataVersion')).toBe('1')
    expect(init.method).toBe('PATCH')
  })

  it('treats an event that is already gone as cancelled', async () => {
    fetchMock.mockResolvedValue(json(410, { error: { message: 'Resource has been deleted' } }))
    const { cancelEvent } = await import('./client')
    await expect(cancelEvent('tok', 'ev1')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })

  it('flags a revoked refresh token as needing a reconnect', async () => {
    fetchMock.mockResolvedValue(json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }))
    const { refreshAccessToken, GoogleApiError } = await import('./client')
    const error = await refreshAccessToken({ clientId: 'c', clientSecret: 's' }, 'rt').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GoogleApiError)
    expect((error as InstanceType<typeof GoogleApiError>).needsReconnect).toBe(true)
  })

  it('lists only expanded single events in the window', async () => {
    fetchMock.mockResolvedValue(json(200, { items: [{ id: 'a' }] }))
    const { listEvents } = await import('./client')
    const items = await listEvents('tok', new Date('2026-10-12T00:00:00Z'), new Date('2026-10-19T00:00:00Z'))
    const q = new URL(fetchMock.mock.calls[0][0]).searchParams
    expect(q.get('singleEvents')).toBe('true')
    expect(q.get('timeMin')).toBe('2026-10-12T00:00:00.000Z')
    expect(items).toEqual([{ id: 'a' }])
  })

  it('sends Gmail as a base64url raw message', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'm1' }))
    const { gmailSend } = await import('./client')
    await gmailSend('tok', 'Subject: Hi\r\n\r\nHello')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    expect(Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8')).toBe('Subject: Hi\r\n\r\nHello')
  })
})
