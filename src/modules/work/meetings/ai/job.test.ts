import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const draftMinutes = vi.fn(async () => ({ source: 'ai', items: 1 }))
vi.mock('./pipeline', () => ({ botProvider: () => null, transcriptionProvider: () => null, refreshTranscription: vi.fn(), draftMinutes: (...a: unknown[]) => draftMinutes(...(a as [])) }))
vi.mock('./bot', () => ({ processBot: vi.fn(), systemAiCtx: async (orgId: string) => (orgId === 'gone' ? null : { orgId }) }))
vi.mock('./purge', () => ({ purgeMeetingRecordings: vi.fn() }))
vi.mock('@/models/work/Meeting', () => ({ Meeting: {} }))
const state = { rows: [] as Record<string, unknown>[], filter: null as Record<string, unknown> | null, incs: [] as unknown[] }
vi.mock('@/models/work/MeetingTranscript', () => ({
  MeetingTranscript: {
    find: (filter: Record<string, unknown>) => { state.filter = filter; return { limit: () => ({ lean: async () => state.rows }) } },
    updateOne: async (f: { _id: string }) => { state.incs.push(f._id); return { modifiedCount: 1 } },
  },
}))

const { MAX_MINUTES_ATTEMPTS, sweepMissingMinutes } = await import('./job')

describe('minutes sweep (L-27d)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.incs = []
    state.rows = [{ _id: 't1', orgId: 'o1', meetingId: 'meet1', requestedById: 'm1' }, { _id: 't2', orgId: 'gone', meetingId: 'meet2', requestedById: 'm1' }]
  })

  it('drafts minutes for done transcripts that never got them, counting each try', async () => {
    // Act
    const drafted = await sweepMissingMinutes(new Date('2026-10-11T00:00:00Z'))

    // Assert
    expect(drafted).toBe(1)
    expect(draftMinutes).toHaveBeenCalledWith({ orgId: 'o1' }, 'meet1', 't1')
    expect(state.incs).toEqual(['t1', 't2'])
    expect(state.filter).toMatchObject({ status: 'done', minutesAt: null, $or: [{ minutesAttempts: null }, { minutesAttempts: { $lt: MAX_MINUTES_ATTEMPTS } }] })
  })

  it('keeps going when one draft fails', async () => {
    draftMinutes.mockRejectedValueOnce(new Error('AI down'))
    state.rows = [state.rows[0], { _id: 't3', orgId: 'o3', meetingId: 'meet3', requestedById: 'm1' }]
    await expect(sweepMissingMinutes(new Date())).resolves.toBe(1)
    expect(draftMinutes).toHaveBeenCalledTimes(2)
  })
})
