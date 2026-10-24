import { describe, expect, test } from 'vitest'
import { deriveSettlement, ledgerClosing, milestoneStatusFor, netReceivable, outstandingOf, unappliedCredit } from './settlement-math'

const base = { status: 'issued' as const, total: 118_000, paid: 0, tds: 0, credited: 0, writtenOff: 0 }

describe('deriveSettlement', () => {
  test('nothing settled stays issued with the full balance', () => {
    expect(deriveSettlement(base)).toEqual({ status: 'issued', balance: 118_000 })
  })

  test('a partial payment makes it part paid', () => {
    expect(deriveSettlement({ ...base, paid: 50_000 })).toEqual({ status: 'part_paid', balance: 68_000 })
  })

  test('cash plus TDS that covers the total makes it paid', () => {
    expect(deriveSettlement({ ...base, paid: 108_000, tds: 10_000 })).toEqual({ status: 'paid', balance: 0 })
  })

  test('credit notes count as settled', () => {
    expect(deriveSettlement({ ...base, paid: 100_000, credited: 18_000 }).status).toBe('paid')
  })

  test('drops back when money is released', () => {
    expect(deriveSettlement({ ...base, status: 'paid' }).status).toBe('issued')
  })

  test('draft and void are left alone with a zero balance', () => {
    expect(deriveSettlement({ ...base, status: 'draft' })).toEqual({ status: 'draft', balance: 0 })
    expect(deriveSettlement({ ...base, status: 'void', paid: 5 })).toEqual({ status: 'void', balance: 0 })
  })

  test('a write-off zeroes the balance without changing the status', () => {
    expect(deriveSettlement({ ...base, paid: 18_000, writtenOff: 100_000 })).toEqual({ status: 'part_paid', balance: 0 })
  })

  test('the balance is never negative', () => {
    expect(deriveSettlement({ ...base, paid: 200_000 }).balance).toBe(0)
  })
})

describe('helpers', () => {
  test('outstanding subtracts settlement and write-off', () => {
    expect(outstandingOf(118_000, 18_000, 0)).toBe(100_000)
  })

  test('milestones follow their invoice', () => {
    expect(milestoneStatusFor('paid')).toBe('paid')
    expect(milestoneStatusFor('part_paid')).toBe('invoiced')
  })

  test('unapplied credit ignores over-allocated rows', () => {
    expect(unappliedCredit([{ amount: 100, allocated: 40 }, { amount: 50, allocated: 50 }])).toBe(60)
  })
})

describe('ledger identity', () => {
  test('ledger closing equals open balances minus unapplied credit', () => {
    // Fixture: one opening row, two invoices, a receipt with TDS, an advance, a credit note and a write-off.
    const invoices = [
      { id: 'ob', total: 125_000, paid: 25_000, tds: 0, credited: 0, writtenOff: 0 },
      { id: 'a', total: 118_000, paid: 106_200, tds: 10_000, credited: 0, writtenOff: 0 },
      { id: 'b', total: 59_000, paid: 0, tds: 0, credited: 11_800, writtenOff: 0 },
      { id: 'c', total: 23_600, paid: 3_600, tds: 0, credited: 0, writtenOff: 20_000 },
    ]
    const receipts = [
      { amount: 134_800, allocated: 25_000 + 106_200 + 3_600 },
      { amount: 50_000, allocated: 0 },
    ]
    const rows = [
      ...invoices.map((i) => ({ debit: i.total, credit: 0 })),
      ...receipts.map((r) => ({ debit: 0, credit: r.amount })),
      ...invoices.map((i) => ({ debit: 0, credit: i.tds + i.credited + i.writtenOff })),
    ]
    const balances = invoices.map((i) => deriveSettlement({ status: 'issued', ...i }).balance)
    expect(ledgerClosing(rows)).toBe(netReceivable(balances, receipts))
  })
})
