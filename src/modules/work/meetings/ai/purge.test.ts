import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ serverEnv: () => ({ MEETINGS_PURGE: '' }) }))
const deleted: string[] = []
vi.mock('@/lib/files', () => ({ deleteStoredFile: async (_o: unknown, id: string) => { deleted.push(id) } }))
const OLD = new Date('2026-06-01T10:00:00Z')
const RECENT = new Date('2026-10-01T10:00:00Z')
const hasAiData = (m: Record<string, unknown>) => { const ai = m.ai as { recordingFileId?: string; transcriptId?: string }; return Boolean(ai.recordingFileId || ai.transcriptId) }
const state = { meetings: [] as Record<string, unknown>[], transcripts: [] as Record<string, unknown>[] }
vi.mock('@/models/Org', () => ({ Org: { findById: (id: string) => ({ lean: async () => ({ _id: id, meetingsAi: id === 'o2' ? { retentionDays: 365 } : undefined }) }) } }))
vi.mock('@/models/work/MeetingTranscript', () => ({ MeetingTranscript: { modelName: 'MeetingTranscript', distinct: async () => ['o1', 'o2'] } }))
vi.mock('@/models/work/Meeting', () => ({ Meeting: { modelName: 'Meeting', distinct: async () => [...new Set(state.meetings.filter((m) => (m.ai as { recordingFileId?: string }).recordingFileId).map((m) => m.orgId))] } }))
vi.mock('@/lib/db/scoped', () => ({
  scoped: (model: { modelName: string }, orgId: string) => {
    if (model.modelName === 'Meeting') {
      return {
        find: (f: { endAt: { $lt: Date } }) => ({ limit: () => ({ lean: async () => state.meetings.filter((m) => m.orgId === orgId && (m.endAt as Date) < f.endAt.$lt && !m.purgedAt && hasAiData(m)) }) }),
        updateOne: async (f: { _id: string }) => { const m = state.meetings.find((x) => x._id === f._id); if (m) m.purgedAt = new Date(); return { modifiedCount: 1 } },
      }
    }
    return {
      find: (f: { meetingId: string }) => ({ lean: async () => state.transcripts.filter((t) => t.meetingId === f.meetingId) }),
      deleteMany: async (f: { meetingId: string }) => { state.transcripts = state.transcripts.filter((t) => t.meetingId !== f.meetingId); return { deletedCount: 1 } },
    }
  },
}))

describe('retention purge', () => {
  beforeEach(() => {
    deleted.length = 0
    state.meetings = [
      { _id: 'a', orgId: 'o1', endAt: OLD, ai: { recordingFileId: 'f1', transcriptId: 't1' } },
      { _id: 'b', orgId: 'o1', endAt: RECENT, ai: { recordingFileId: 'f2', transcriptId: 't2' } },
      { _id: 'c', orgId: 'o2', endAt: OLD, ai: { recordingFileId: 'f3', transcriptId: 't3' } },
    ]
    state.transcripts = [{ meetingId: 'a', recordingFileId: 'f1' }, { meetingId: 'b', recordingFileId: 'f2' }, { meetingId: 'c', recordingFileId: 'f3' }]
  })

  it('a dry run counts what is past each workspace’s retention and deletes nothing', async () => {
    const { purgeMeetingRecordings } = await import('./purge')
    const report = await purgeMeetingRecordings(new Date('2026-10-09T00:00:00Z'), false)
    expect(report).toEqual({ dryRun: true, workspaces: 1, meetings: 1, recordings: 1, transcripts: 1 })
    expect(deleted).toEqual([])
    expect(state.transcripts).toHaveLength(3)
  })

  it('a live run deletes the recording and transcript, and only once', async () => {
    const { purgeMeetingRecordings } = await import('./purge')
    await purgeMeetingRecordings(new Date('2026-10-09T00:00:00Z'), true)
    expect(deleted).toEqual(['f1'])
    expect(state.transcripts.map((t) => t.meetingId)).toEqual(['b', 'c'])
    const again = await purgeMeetingRecordings(new Date('2026-10-09T00:00:00Z'), true)
    expect(again.meetings).toBe(0)
  })

  it('purges a recording whose transcript was deleted, in a workspace with no transcripts (R3 M10)', async () => {
    // Arrange
    state.meetings.push({ _id: 'd', orgId: 'o3', endAt: OLD, ai: { recordingFileId: 'f4' } })
    const { purgeMeetingRecordings } = await import('./purge')

    // Act
    await purgeMeetingRecordings(new Date('2026-10-09T00:00:00Z'), true)

    // Assert
    expect(deleted).toContain('f4')
  })

  it('stops starting new meetings once the time budget is spent (L-28c)', async () => {
    // Arrange: the clock jumps past the budget after the first check.
    const { purgeMeetingRecordings, PURGE_TIME_BUDGET_MS } = await import('./purge')
    let calls = 0
    const clock = () => (calls++ === 0 ? 0 : PURGE_TIME_BUDGET_MS + 1)

    // Act
    const report = await purgeMeetingRecordings(new Date('2026-10-09T00:00:00Z'), true, clock)

    // Assert
    expect(report.meetings).toBe(0)
    expect(deleted).toEqual([])
  })
})
