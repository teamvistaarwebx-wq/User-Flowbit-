import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const sendMail = vi.fn(async () => undefined)
vi.mock('@/lib/mail', () => ({ sendMail: (...a: unknown[]) => sendMail(...(a as [])), emailLayout: () => ({ html: '', text: '' }) }))
const saveFile = vi.fn(async () => ({ _id: 'file1', name: 'rec.mp3', mime: 'audio/mpeg' }))
const deleteStoredFile = vi.fn(async () => undefined)
vi.mock('@/lib/files', () => ({ saveFile: (...a: unknown[]) => saveFile(...(a as [])), deleteStoredFile: (...a: unknown[]) => deleteStoredFile(...(a as [])) }))
const startTranscription = vi.fn(async () => undefined)
vi.mock('./pipeline', () => ({ botProvider: () => null, finishTranscript: vi.fn(), startTranscription: (...a: unknown[]) => startTranscription(...(a as [])) }))
vi.mock('./usage', () => ({ meetingAllowanceFor: async () => ({ allowed: true }) }))
vi.mock('@/models/User', () => ({ User: { find: () => ({ lean: async () => [{ email: 'a@x.test' }] }) } }))
vi.mock('@/models/Member', () => ({ Member: { modelName: 'Member' } }))
vi.mock('@/models/Org', () => ({ Org: {} }))
vi.mock('@/models/work/Meeting', () => ({ Meeting: { modelName: 'Meeting' } }))
vi.mock('@/models/work/MeetingTranscript', () => ({ MeetingTranscript: { modelName: 'MeetingTranscript' } }))
vi.mock('@/lib/db/scoped', () => ({ scoped: vi.fn() }))
vi.mock('@/lib/entitlements', () => ({ entitlements: vi.fn() }))

const { bookingClaimFilter, pickupClaimFilter, processBot, scheduleNotetaker } = await import('./bot')

const HOUR = 3_600_000
let meeting: Record<string, unknown>
/** Meeting updates in order; `claims` answers modifiedCount per conditional update. */
const updates: { filter: Record<string, unknown>; update: Record<string, unknown> }[] = []
let claims: number[] = []
const db = (model: { modelName: string }) => ({
  findById: () => ({ lean: async () => (model.modelName === 'Meeting' ? meeting : null) }),
  find: () => ({ lean: async () => [{ userId: 'u1' }] }),
  updateOne: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
    updates.push({ filter, update })
    return { modifiedCount: claims.length ? claims.shift() : 1 }
  },
})
const ctx = { orgId: 'o1', memberId: 'm1', db, entitlements: {}, org: {}, orgName: 'Kalpa', organizerName: 'Priya' } as never
const provider = (overrides: Record<string, unknown> = {}) => ({
  name: 'recall',
  schedule: vi.fn(async () => ({ botId: 'bot1' })),
  cancel: vi.fn(async () => undefined),
  artifacts: vi.fn(async () => ({ status: 'done', audioUrl: 'https://recall.test/a.mp3', transcript: null })),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  claims = []
  meeting = { _id: 'meet1', title: 'Kalpa sync', status: 'scheduled', link: 'https://meet.google.com/abc-defg-hij', startAt: new Date(Date.now() + HOUR), endAt: new Date(Date.now() + 2 * HOUR), organizerId: 'm1', attendees: [], notetaker: { botId: 'bot1', status: 'scheduled' } }
})

describe('claim filters', () => {
  it('lets a booking take a meeting with no live notetaker or an expired booking', () => {
    const now = new Date('2026-10-11T00:00:00Z')
    expect(bookingClaimFilter('meet1', now)).toEqual({ _id: 'meet1', $or: [{ 'notetaker.status': { $in: [null, 'cancelled', 'failed'] } }, { 'notetaker.status': 'booking', 'notetaker.claimUntil': { $lt: now } }] })
    expect(pickupClaimFilter('meet1', now)).toMatchObject({ 'notetaker.fetchedAt': null, $or: [{ 'notetaker.claimUntil': null }, { 'notetaker.claimUntil': { $lt: now } }] })
  })
})

describe('scheduleNotetaker (R3 M6)', () => {
  it('books no bot when another send holds the claim', async () => {
    // Arrange
    claims = [0]
    const bot = provider()

    // Act + Assert
    await expect(scheduleNotetaker(ctx, 'meet1', 90, bot as never)).rejects.toThrow(/already booked/)
    expect(bot.schedule).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('claims first, then books and stores the bot', async () => {
    const bot = provider()
    await expect(scheduleNotetaker(ctx, 'meet1', 90, bot as never)).resolves.toEqual({ botId: 'bot1', noticeTo: 1 })
    expect(updates[0].update).toMatchObject({ $set: { notetaker: { status: 'booking' } } })
    expect(updates[1].update).toMatchObject({ $set: { notetaker: { botId: 'bot1', status: 'scheduled' } } })
  })

  it('cancels the bot and frees the meeting when the notice fails', async () => {
    // Arrange
    sendMail.mockRejectedValueOnce(new Error('mail down'))
    const bot = provider()

    // Act
    await expect(scheduleNotetaker(ctx, 'meet1', 90, bot as never)).rejects.toThrow('mail down')

    // Assert
    expect(bot.cancel).toHaveBeenCalledWith('bot1')
    expect(updates.at(-1)).toEqual({ filter: { _id: 'meet1', 'notetaker.status': 'booking' }, update: { $unset: { notetaker: 1 } } })
  })
})

describe('processBot (R3 M4)', () => {
  it('does not mark the pick-up done when the download fails, and releases the claim', async () => {
    // Arrange
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 }))

    // Act
    await expect(processBot(ctx, 'meet1', provider() as never, fetchImpl)).rejects.toThrow(/503/)

    // Assert
    const sets = updates.map((u) => JSON.stringify(u.update))
    expect(sets.some((s) => s.includes('"notetaker.status":"done"'))).toBe(false)
    expect(updates.some((u) => (u.update.$unset as Record<string, unknown> | undefined)?.['notetaker.claimUntil'])).toBe(true)
    expect(updates.some((u) => (u.update.$inc as Record<string, unknown> | undefined)?.['notetaker.pickupAttempts'] === 1)).toBe(true)
  })

  it('answers busy while another pick-up holds the claim', async () => {
    claims = [0]
    const fetchImpl = vi.fn()
    await expect(processBot(ctx, 'meet1', provider() as never, fetchImpl)).resolves.toBe('busy')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses audio whose Content-Length is over the cap without reading it', async () => {
    const fetchImpl = vi.fn(async () => new Response('x', { headers: { 'content-length': String(300 * 1024 * 1024) } }))
    await expect(processBot(ctx, 'meet1', provider() as never, fetchImpl)).resolves.toBe('failed')
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('marks done only after the transcription started', async () => {
    // Arrange
    const fetchImpl = vi.fn(async () => new Response('audio-bytes'))

    // Act
    const state = await processBot(ctx, 'meet1', provider() as never, fetchImpl)

    // Assert
    expect(state).toBe('transcribing')
    expect(startTranscription).toHaveBeenCalledTimes(1)
    expect(updates.at(-1)?.update).toMatchObject({ $set: { 'notetaker.status': 'done' } })
  })

  it('deletes the stored audio and releases the claim when the transcription cannot start', async () => {
    startTranscription.mockRejectedValueOnce(new Error('cap'))
    const fetchImpl = vi.fn(async () => new Response('audio-bytes'))
    await expect(processBot(ctx, 'meet1', provider() as never, fetchImpl)).rejects.toThrow('cap')
    expect(deleteStoredFile).toHaveBeenCalledWith('o1', 'file1')
    expect(updates.some((u) => JSON.stringify(u.update).includes('"notetaker.status":"done"'))).toBe(false)
  })
})
