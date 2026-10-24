import { describe, expect, test } from 'vitest'
import { joinNumbers, receiptPaymentVars } from './payment-vars'

const vars = (number: string, balance: number) => ({ client_name: 'Asha', invoice_number: number, balance_due_paise: balance, receipt_number: 'RCT-1' })

describe('one payment.received per receipt (6.9)', () => {
  test('a receipt for one invoice keeps that invoice and amount', () => {
    expect(receiptPaymentVars([{ number: 'INV-1', balancePaise: 0, amountPaise: 50_000, vars: vars('INV-1', 0) }])).toMatchObject({ invoice_number: 'INV-1', amount_paise: 50_000, balance_due_paise: 0 })
  })

  test('a split deposit thanks once for the whole amount and names every invoice', () => {
    const out = receiptPaymentVars([
      { number: 'INV-1', balancePaise: 0, amountPaise: 30_000, vars: vars('INV-1', 0) },
      { number: 'INV-2', balancePaise: 0, amountPaise: 20_000, vars: vars('INV-2', 0) },
    ])
    expect(out).toMatchObject({ client_name: 'Asha', invoice_number: 'INV-1 and INV-2', amount_paise: 50_000, balance_due_paise: 0, receipt_number: 'RCT-1' })
  })

  test('a balance left on any invoice makes it a part payment', () => {
    const out = receiptPaymentVars([
      { number: 'INV-1', balancePaise: 0, amountPaise: 30_000, vars: vars('INV-1', 0) },
      { number: 'INV-2', balancePaise: 5_000, amountPaise: 20_000, vars: vars('INV-2', 5_000) },
    ])
    expect(out?.balance_due_paise).toBe(5_000)
  })

  test('nothing paid, no event', () => {
    expect(receiptPaymentVars([])).toBeNull()
  })

  test('joins invoice numbers in plain English', () => {
    expect(joinNumbers(['A'])).toBe('A')
    expect(joinNumbers(['A', 'B', 'C'])).toBe('A, B and C')
    expect(joinNumbers([])).toBe('')
  })
})
