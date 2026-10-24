import { describe, expect, it } from 'vitest'
import { receiptIssue, spendOldestFirst, unallocatedPaise } from './rules'

describe('receiptIssue', () => {
  it('refuses a receipt for zero', () => {
    expect(receiptIssue(0, [])).toBe('A receipt must be for more than zero.')
  })
  it('refuses allocating more than was received', () => {
    expect(receiptIssue(1_000_00, [{ invoiceId: 'a', amountPaise: 1_200_00 }])).toBe('This receipt has only ₹1,000.00 to allocate.')
  })
  it('refuses the same invoice twice', () => {
    expect(receiptIssue(1_000_00, [{ invoiceId: 'a', amountPaise: 100 }, { invoiceId: 'a', amountPaise: 100 }])).toBe("An invoice can only appear once in a receipt's allocations.")
  })
  it('refuses an empty allocation row', () => {
    expect(receiptIssue(1_000_00, [{ invoiceId: 'a', amountPaise: 0, tdsPaise: 0 }])).toBe('Each allocation needs an amount or TDS above zero.')
  })
  it('does not count TDS against the cash received', () => {
    expect(receiptIssue(1_000_00, [{ invoiceId: 'a', amountPaise: 1_000_00, tdsPaise: 100_00 }])).toBeNull()
  })
})

describe('spendOldestFirst', () => {
  const open = [
    { invoiceId: 'late', outstandingPaise: 500, dueDate: '2026-10-20', issueDate: '2026-10-05' },
    { invoiceId: 'old', outstandingPaise: 300, dueDate: '2026-09-15', issueDate: '2026-09-01' },
    { invoiceId: 'mid', outstandingPaise: 400, dueDate: '2026-10-01', issueDate: '2026-09-16' },
  ]
  it('fills the oldest due first until the money runs out', () => {
    expect(spendOldestFirst(open, 600)).toEqual([
      { invoiceId: 'old', amountPaise: 300 },
      { invoiceId: 'mid', amountPaise: 300 },
    ])
  })
  it('leaves the rest unallocated when everything is covered', () => {
    const rows = spendOldestFirst(open, 2_000)
    expect(rows.reduce((s, r) => s + r.amountPaise, 0)).toBe(1_200)
    expect(unallocatedPaise(2_000, rows.map((r) => ({ invoiceId: r.invoiceId, amountPaise: r.amountPaise })))).toBe(800)
  })
  it('does not mutate its input', () => {
    spendOldestFirst(open, 600)
    expect(open.map((o) => o.invoiceId)).toEqual(['late', 'old', 'mid'])
  })
})
