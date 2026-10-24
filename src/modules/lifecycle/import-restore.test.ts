import { describe, expect, it } from 'vitest'
import { undoRefusal } from '@/modules/imports/batch'
import { CLEAR_RESTORE, expiredRestoreFilter, isRestoreExpired } from './import-restore'

const NOW = new Date('2026-10-11T04:30:00Z')

describe('clearing import restore copies (R3 L-30c)', () => {
  it('clears only batches whose undo window has passed', () => {
    // Arrange
    const past = { undoUntil: new Date(NOW.getTime() - 1000) }
    const open = { undoUntil: new Date(NOW.getTime() + 1000) }

    // Act, Assert
    expect(isRestoreExpired(past, NOW)).toBe(true)
    expect(isRestoreExpired(open, NOW)).toBe(false)
  })

  it('agrees with the undo refusal, so nothing undoable loses its copies', () => {
    const edge = { status: 'done' as const, undoUntil: NOW }
    expect(isRestoreExpired(edge, NOW)).toBe(true)
    expect(undoRefusal(edge, NOW)).not.toBeNull()
  })

  it('selects expired batches with copies and empties restore', () => {
    expect(expiredRestoreFilter(NOW)).toEqual({ undoUntil: { $lte: NOW }, 'restore.0': { $exists: true } })
    expect(CLEAR_RESTORE).toEqual({ $set: { restore: [] } })
  })
})
