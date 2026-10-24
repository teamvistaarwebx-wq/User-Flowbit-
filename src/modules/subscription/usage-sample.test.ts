import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('seat usage', () => {
  it('does not count sample-agency employees as seats (R1 1.3)', async () => {
    const { SEAT_EMPLOYEES } = await import('./usage')
    expect(SEAT_EMPLOYEES.sample).toEqual({ $ne: true })
    expect(SEAT_EMPLOYEES.deletedAt).toBeNull()
  })
})
