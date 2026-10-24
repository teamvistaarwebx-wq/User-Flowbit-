import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({ bulk: [] as unknown[][], updateOne: vi.fn() }))

const { AttendanceDay } = await import('@/models/AttendanceDay')
const { AttendanceCorrection } = await import('@/models/muster/AttendanceCorrection')
const { writeMarks } = await import('./marks')

const orgId = new Types.ObjectId()
const upserted = new Types.ObjectId()

function fakeCtx() {
  const corrections = {
    updateMany: async () => ({ modifiedCount: 0 }),
    insertMany: async (docs: Record<string, unknown>[]) => docs.map(() => ({ _id: new Types.ObjectId() })),
  }
  const days = { updateOne: h.updateOne }
  return {
    orgId,
    userId: new Types.ObjectId(),
    user: { name: 'Asha' },
    org: {},
    db: (model: unknown) => (model === AttendanceCorrection ? corrections : model === AttendanceDay ? days : null),
  }
}

describe('writeMarks', () => {
  it('mirrors every linked mark onto core days in one bulk write scoped to the workspace', async () => {
    // Arrange: 3 marks, 2 of them for members with a login; the bulk write upserts one new day.
    const spy = vi.spyOn(AttendanceDay, 'bulkWrite').mockImplementation((async (ops: unknown[]) => {
      h.bulk.push(ops)
      return { upsertedIds: { 1: upserted } }
    }) as never)
    const a = new Types.ObjectId()
    const b = new Types.ObjectId()
    const marks = [
      { employeeId: new Types.ObjectId(), memberId: a, date: '2026-09-01', status: 'present' as const, reason: 'Imported', times: { in: '22:00', out: '25:30' } },
      { employeeId: new Types.ObjectId(), memberId: null, date: '2026-09-01', status: 'absent' as const, reason: 'Imported' },
      { employeeId: new Types.ObjectId(), memberId: b, date: '2026-09-02', status: 'absent' as const, reason: 'Imported' },
    ]

    // Act
    const written = await writeMarks(fakeCtx() as never, marks, 'import')

    // Assert: one round trip, never the per-mark updateOne; filters carry the workspace.
    expect(spy).toHaveBeenCalledTimes(1)
    expect(h.updateOne).not.toHaveBeenCalled()
    const ops = h.bulk[0] as { updateOne: { filter: Record<string, unknown>; update: Record<string, Record<string, unknown>>; upsert: boolean } }[]
    expect(ops).toHaveLength(2)
    expect(ops.map((o) => o.updateOne.filter)).toEqual([{ orgId, memberId: a, date: '2026-09-01' }, { orgId, memberId: b, date: '2026-09-02' }])
    expect(ops.every((o) => o.updateOne.upsert)).toBe(true)
    // A night shift's 25:30 out is the next morning's punch, worked time counted across midnight.
    const timed = ops[0].updateOne.update.$set
    expect((timed.punches as { at: Date }[]).map((p) => p.at.toISOString())).toEqual(['2026-09-01T16:30:00.000Z', '2026-09-01T20:00:00.000Z'])
    expect(timed.workedMinutes).toBe(210)
    expect(ops[1].updateOne.update.$setOnInsert).toMatchObject({ punches: [], workedMinutes: 0 })
    expect(written.newDayIds).toEqual([upserted])
    spy.mockRestore()
  })
})
