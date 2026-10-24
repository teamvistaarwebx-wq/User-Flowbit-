import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('leave escalation timing (R1 4.4)', () => {
  it('times from the last stage decision, not from when the request was raised', async () => {
    const { stageStartedAt } = await import('./team')
    const createdAt = new Date('2026-10-01T09:00:00Z')
    const managerApproved = new Date('2026-10-02T15:00:00Z')
    expect(stageStartedAt({ createdAt, decisions: [{ decidedAt: managerApproved }] })).toEqual(managerApproved)
    expect(stageStartedAt({ createdAt, decisions: [] })).toEqual(createdAt)
  })
})
