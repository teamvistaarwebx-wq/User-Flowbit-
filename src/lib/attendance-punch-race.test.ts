import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('two punches at once (R1 2.5)', () => {
  it('writes only onto the day as it was read', async () => {
    const { punchWriteFilter } = await import('./attendance')
    const day = { orgId: 'o', memberId: 'm', date: '2026-10-11' }
    expect(punchWriteFilter(day, null)).toEqual(day)
    expect(punchWriteFilter(day, 2)).toEqual({ ...day, punches: { $size: 2 } })
    expect(punchWriteFilter(day, 0)).toEqual({ ...day, $or: [{ punches: { $size: 0 } }, { punches: { $exists: false } }] })
  })
})

describe('location at check-in for remote workers', () => {
  const org = { attendanceGeo: { mode: 'required', outside: 'block', offices: [] } }
  /** A ctx whose linked employee record has the given work mode (undefined: no record linked). */
  const ctxWith = (workMode: string | null | undefined, linked = true) =>
    ({ org, member: { employeeId: linked ? 'e1' : undefined }, db: () => ({ findOne: () => ({ lean: async () => (workMode === undefined ? null : { workMode }) }) }) }) as never

  it('turns the location off for a remote worker only', async () => {
    const { checkInGeoFor } = await import('./attendance')
    await expect(checkInGeoFor(ctxWith('remote'))).resolves.toMatchObject({ remote: true, settings: { mode: 'off', outside: 'block' } })
    await expect(checkInGeoFor(ctxWith('office'))).resolves.toMatchObject({ remote: false, settings: { mode: 'required' } })
  })

  it('treats no work mode, or no employee record, as office', async () => {
    const { checkInGeoFor } = await import('./attendance')
    await expect(checkInGeoFor(ctxWith(null))).resolves.toMatchObject({ remote: false, settings: { mode: 'required' } })
    await expect(checkInGeoFor(ctxWith('remote', false))).resolves.toMatchObject({ remote: false, settings: { mode: 'required' } })
  })
})

describe('checking in on a leave day (R1 2.10)', () => {
  it('warns that payroll still counts the leave', async () => {
    const { leaveDayWarning } = await import('./attendance')
    expect(leaveDayWarning('in', 'leave')).toMatch(/approved leave today/)
    expect(leaveDayWarning('in', 'present')).toBe('')
    expect(leaveDayWarning('out', 'leave')).toBe('')
  })
})
