import { describe, expect, it } from 'vitest'
import { OWNER_DELETE_PURGE_DAYS, ownerDeletionPurgeAt, ownerDeletionPurgeDue } from './lifecycle'
import type { OrgLike } from './plans'

const DAY = 86_400_000
const DELETED = new Date('2026-10-11T06:00:00Z')
const paid: OrgLike = { deletedAt: DELETED, subscription: { status: 'active', plan: 'suite', accountType: 'paid' } }

describe('purging owner-deleted workspaces (owner decision D4, B2)', () => {
  it('removes the data 30 days after the owner deleted the workspace, not a moment before', () => {
    // Arrange
    const purgeAt = new Date(DELETED.getTime() + 30 * DAY)
    // Act / Assert
    expect(OWNER_DELETE_PURGE_DAYS).toBe(30)
    expect(ownerDeletionPurgeAt(paid)).toEqual(purgeAt)
    expect(ownerDeletionPurgeDue(paid, new Date(purgeAt.getTime() - 1))).toBe(false)
    expect(ownerDeletionPurgeDue(paid, purgeAt)).toBe(true)
    expect(ownerDeletionPurgeDue(paid, new Date(purgeAt.getTime() + 5 * DAY))).toBe(true)
  })

  it('never purges a live workspace, a tombstone, a held (staff-disabled) one, or Internal and Test', () => {
    const late = new Date(DELETED.getTime() + 60 * DAY)
    expect(ownerDeletionPurgeDue({ ...paid, deletedAt: null }, late)).toBe(false)
    expect(ownerDeletionPurgeDue({ ...paid, status: 'deleted' }, late)).toBe(false)
    expect(ownerDeletionPurgeAt({ ...paid, status: 'deleted' })).toBeNull()
    expect(ownerDeletionPurgeDue({ ...paid, disabled: true }, late)).toBe(false)
    expect(ownerDeletionPurgeDue({ ...paid, subscription: { status: 'active', plan: 'suite', accountType: 'internal' } }, late)).toBe(false)
    expect(ownerDeletionPurgeDue({ ...paid, subscription: { status: 'active', plan: 'suite', accountType: 'test' } }, late)).toBe(false)
  })

  it('applies to Free and trial workspaces too', () => {
    const late = new Date(DELETED.getTime() + 31 * DAY)
    expect(ownerDeletionPurgeDue({ deletedAt: DELETED, subscription: { status: 'trialing', plan: 'trial', accountType: 'free' } }, late)).toBe(true)
  })
})
