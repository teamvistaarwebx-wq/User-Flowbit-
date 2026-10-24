import { describe, expect, it } from 'vitest'
import { publicTotals } from './totals'

const FIRST = { label: 'Subtotal', amountPaise: 10_000_000 }

describe('public document totals', () => {
  it('adds tax rows above the total on a normal invoice', () => {
    const rows = publicTotals({ cgstPaise: 900_000, sgstPaise: 900_000, igstPaise: 0, totalPaise: 11_800_000 }, { first: FIRST, totalLabel: 'Total' })
    expect(rows.map((r) => r.label)).toEqual(['Subtotal', 'CGST', 'SGST', 'Total'])
  })

  it('keeps reverse-charge tax out of the sum and names it after the total (R1 6.1)', () => {
    const rows = publicTotals({ cgstPaise: 900_000, sgstPaise: 900_000, igstPaise: 0, totalPaise: 10_000_000, reverseCharge: true }, { first: FIRST, totalLabel: 'Total' })
    expect(rows.map((r) => r.label).slice(0, 2)).toEqual(['Subtotal', 'Total'])
    expect(rows[2].label).toMatch(/payable by the recipient under reverse charge/)
    expect(rows[2].amountPaise).toBe(1_800_000)
  })

  it('shows the round-off row on a credit note (R1 6.8)', () => {
    const rows = publicTotals({ taxablePaise: 999_950, cgstPaise: 0, sgstPaise: 0, igstPaise: 179_991, roundOffPaise: 59, totalPaise: 1_180_000 }, { first: { label: 'Taxable value', amountPaise: 999_950 }, totalLabel: 'Total credit' })
    expect(rows.map((r) => [r.label, r.amountPaise])).toEqual([['Taxable value', 999_950], ['IGST', 179_991], ['Round off', 59], ['Total credit', 1_180_000]])
  })
})
