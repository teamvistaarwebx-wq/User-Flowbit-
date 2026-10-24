import { describe, expect, it } from 'vitest'
import { buildStatement, closingSentence, monthlyLedger, type LedgerRow } from './ledger-math'

const row = (date: string, type: LedgerRow['type'], debit: number, credit: number, id: string): LedgerRow => ({
  date,
  type,
  debitPaise: debit,
  creditPaise: credit,
  particulars: type,
  document: id,
  href: null,
  sourceId: id,
})

// Fixture: opening 1,000; two invoices; a receipt that pays the first and leaves 200 unapplied; TDS; a credit note.
const rows: LedgerRow[] = [
  row('2026-08-01', 'tax_invoice', 1_180, 0, 'inv1'),
  row('2026-04-01', 'opening', 1_000, 0, 'ob'),
  row('2026-08-20', 'receipt', 0, 1_262, 'rc1'),
  row('2026-08-20', 'tds', 0, 118, 'rc1-tds'),
  row('2026-09-01', 'tax_invoice', 2_360, 0, 'inv2'),
  row('2026-09-10', 'credit_note', 0, 236, 'cn1'),
]

describe('buildStatement', () => {
  it('orders by date, then type, and runs the balance from zero without a range', () => {
    const s = buildStatement(rows)
    expect(s.rows.map((r) => r.sourceId)).toEqual(['ob', 'inv1', 'rc1', 'rc1-tds', 'inv2', 'cn1'])
    expect(s.rows.map((r) => r.balancePaise)).toEqual([1_000, 2_180, 918, 800, 3_160, 2_924])
    expect(s.closingPaise).toBe(2_924)
  })

  it('starts a ranged statement at the brought-forward, so the closing is the real closing', () => {
    const s = buildStatement(rows, { from: '2026-09-01' })
    expect(s.broughtForwardPaise).toBe(800)
    expect(s.rows.map((r) => r.sourceId)).toEqual(['inv2', 'cn1'])
    expect(s.closingPaise).toBe(buildStatement(rows).closingPaise)
  })

  it('stops at the to date', () => {
    const s = buildStatement(rows, { to: '2026-08-31' })
    expect(s.closingPaise).toBe(800)
    expect(s.debitPaise).toBe(2_180)
    expect(s.creditPaise).toBe(1_380)
  })

  it('ties the closing balance to open balances minus unapplied credit', () => {
    // Open balances: opening 1,000 (receipt applied 1,180 cash+tds to inv1 only, 200 left unapplied); inv1 settled 0;
    // inv2 2,360 - credit note 236 = 2,124. Unapplied = 1,262 - 1,062 applied cash = 200.
    const openBalances = 1_000 + 0 + 2_124
    const unapplied = 200
    expect(buildStatement(rows).closingPaise).toBe(openBalances - unapplied)
  })
})

describe('monthlyLedger', () => {
  it('rolls each month into the next, newest first', () => {
    const months = monthlyLedger(rows)
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-08', '2026-04'])
    expect(months[2]).toEqual({ month: '2026-04', openingPaise: 0, billedPaise: 1_000, settledPaise: 0, closingPaise: 1_000 })
    expect(months[0].openingPaise).toBe(months[1].closingPaise)
    expect(months[0].closingPaise).toBe(2_924)
  })
})

describe('closingSentence', () => {
  it('says who owes whom', () => {
    expect(closingSentence('Aarav Retail', 1_47_500_00).sentence).toBe('Aarav Retail owes ₹1,47,500.00.')
    expect(closingSentence('Aarav Retail', -50_000_00).sentence).toBe("We hold ₹50,000.00 of Aarav Retail's money as credit.")
    expect(closingSentence('Aarav Retail', 0).sentence).toBe('The account is square.')
  })
})

describe('closingSentence with a print formatter', () => {
  it('uses the formatter it is given (PDFs print Rs.)', () => {
    expect(closingSentence('Aarav Retail', 1_47_500_00, (p) => `Rs. ${p / 100}`).sentence).toBe('Aarav Retail owes Rs. 147500.')
  })
})
