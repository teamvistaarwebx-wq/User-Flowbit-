import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('accepting an invite (R1 1.10)', () => {
  it('claims only an unused, unrevoked, unexpired invite', async () => {
    const { inviteClaimFilter } = await import('./invites')
    const now = new Date('2026-10-11T00:00:00Z')
    expect(inviteClaimFilter('i1', now)).toEqual({ _id: 'i1', acceptedAt: null, revokedAt: null, expiresAt: { $gt: now } })
  })

  it("takes over the invite's own member row when its placeholder account is gone, instead of adding a second row", async () => {
    const { invitedRowAction } = await import('./invites')
    const pending = { userId: 'deleted-placeholder', status: 'invited' }
    // The usual case: the row already belongs to the account accepting.
    expect(invitedRowAction({ userId: 'u1', status: 'invited' }, 'u1', true, true)).toBe('keep')
    // The placeholder account was deleted and sign-up made a new one with no row here: claim the pending row.
    expect(invitedRowAction(pending, 'u-new', false, false)).toBe('claim')
    // The new account already has its own row here: drop the stale pending row rather than keep two.
    expect(invitedRowAction(pending, 'u-new', false, true)).toBe('drop')
    // Never touch a row whose account still exists, or one that is not merely pending.
    expect(invitedRowAction(pending, 'u-new', true, false)).toBe('keep')
    expect(invitedRowAction({ userId: 'gone', status: 'disabled' }, 'u-new', false, true)).toBe('keep')
    expect(invitedRowAction(null, 'u-new', false, false)).toBe('keep')
  })
})
