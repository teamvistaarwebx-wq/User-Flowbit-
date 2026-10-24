import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const notifyMembers = vi.fn()
vi.mock('@/lib/notify', () => ({ notifyMembers: (...args: unknown[]) => notifyMembers(...args) }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))
vi.mock('@/models/Member', () => ({ Member: 'Member' }))
vi.mock('@/models/work/TimeEntry', () => ({ TimeEntry: 'TimeEntry' }))
vi.mock('@/models/work/Timesheet', () => ({ Timesheet: 'Timesheet' }))

const SHEET = { _id: 's1', memberId: 'm-emp', approverId: 'm-boss', status: 'submitted', weekStart: '2026-10-05' }

/** A ctx whose Timesheet write only succeeds while the row is still 'submitted'. */
function fakeCtx(state: { status: string }) {
  const sheetUpdate = vi.fn(async (filter: { status?: string }) => {
    if (filter.status && filter.status !== state.status) return { modifiedCount: 0 }
    state.status = 'decided'
    return { modifiedCount: 1 }
  })
  const entryUpdate = vi.fn(async () => ({ modifiedCount: 3 }))
  const lean = <T,>(v: T) => ({ lean: async () => v })
  const db = (model: string) => {
    if (model === 'Timesheet') return { findOne: () => lean({ ...SHEET }), updateOne: sheetUpdate }
    if (model === 'TimeEntry') return { updateMany: entryUpdate }
    return { findById: () => lean({ _id: SHEET.memberId }) }
  }
  return { ctx: { db, memberId: 'm-boss', can: () => false } as never, sheetUpdate, entryUpdate }
}

describe('decideTimesheet', () => {
  beforeEach(() => notifyMembers.mockReset())

  it('approves a submitted timesheet once, with a status-conditional write', async () => {
    const { decideTimesheet } = await import('./decide')
    const { ctx, sheetUpdate } = fakeCtx({ status: 'submitted' })
    const result = await decideTimesheet(ctx, 's1', 'approved')
    expect(result.ok).toBe(true)
    expect(sheetUpdate.mock.calls[0][0]).toMatchObject({ status: 'submitted' })
    expect(notifyMembers).toHaveBeenCalledTimes(1)
  })

  it('refuses the second of two racing decisions and sends no second message', async () => {
    const { decideTimesheet } = await import('./decide')
    const state = { status: 'submitted' }
    const { ctx, entryUpdate } = fakeCtx(state)
    // Both requests read 'submitted' before either writes.
    const [first, second] = await Promise.all([decideTimesheet(ctx, 's1', 'approved'), decideTimesheet(ctx, 's1', 'rejected', 'wrong hours')])
    expect([first.ok, second.ok].sort()).toEqual([false, true])
    const refused = first.ok ? second : first
    expect(refused.ok ? '' : refused.error).toMatch(/already decided/)
    expect(entryUpdate).toHaveBeenCalledTimes(1)
    expect(notifyMembers).toHaveBeenCalledTimes(1)
  })
})
