import { describe, expect, it } from 'vitest'
import { claimantLines } from './rules'

describe('claimantLines (R3 L-23e)', () => {
  it('keeps the reviewer note as plain text, so the email layout escapes it once', () => {
    // Arrange
    const claim = { purpose: 'Travel', amountClaimed: 120_000 }

    // Act
    const lines = claimantLines(claim, 'rejected', 0, 'Bills & receipts <missing>')

    // Assert
    expect(lines).toContain('Note from the reviewer: Bills & receipts <missing>')
  })

  it('leaves the note out when there is none', () => {
    expect(claimantLines({ purpose: 'Travel', amountClaimed: 120_000 }, 'approved', 120_000)).toHaveLength(2)
  })
})
