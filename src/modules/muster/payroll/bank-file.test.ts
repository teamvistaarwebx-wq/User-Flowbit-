import { describe, expect, it } from 'vitest'
import { buildBankFile, cleanNarration, payeeProblem, type BankPayee } from './bank-file'

const aditi: BankPayee = { code: 'VW-0002', name: 'Aditi Sharma', accountName: 'ADITI SHARMA', accountNumber: '50100234567890', ifsc: 'hdfc0001234', email: 'aditi@vistaar.in', amountPaise: 84_512_50 }
const big: BankPayee = { code: 'VW-0001', name: 'Sanskaar Singh', accountNumber: '123456789012', ifsc: 'ICIC0000123', amountPaise: 6_00_000_00 }
const noBank: BankPayee = { code: 'VW-0018', name: 'Riya Kapoor', amountPaise: 30_000_00 }
const base = { payees: [aditi, big, noBank], debitAccount: '00112233445566', mode: 'IMPS' as const, valueDate: '2026-10-31', narration: 'Salary Oct-2026 / Vistaar' }

describe('payeeProblem', () => {
  it('names what stops a bank transfer', () => {
    expect(payeeProblem(aditi)).toBeNull()
    expect(payeeProblem(noBank)).toBe('no bank account on record')
    expect(payeeProblem({ ...aditi, ifsc: 'HDFC1234' })).toBe('no valid IFSC on record')
    expect(payeeProblem({ ...aditi, amountPaise: 0 })).toBe('nothing to pay')
    expect(payeeProblem({ ...aditi, unverifiedChange: true })).toContain('not verified')
    expect(buildBankFile({ layout: 'generic', payees: [{ ...aditi, unverifiedChange: true }], debitAccount: '123456789', mode: 'NEFT', valueDate: '2026-10-01', narration: 'Salary' }).rows).toEqual([])
  })
})

describe('buildBankFile', () => {
  it('writes the generic layout, leaving out people who cannot be paid', () => {
    const file = buildBankFile({ ...base, layout: 'generic' })
    expect(file.header[0]).toBe('Beneficiary Name')
    expect(file.rows).toHaveLength(2)
    expect(file.rows[0]).toEqual(['ADITI SHARMA', '50100234567890', 'HDFC0001234', '84512.50', 'IMPS', 'Salary Oct 2026 Vistaar', 'aditi@vistaar.in', '00112233445566', '31/10/2026', 'VW-0002'])
    expect(file.totalPaise).toBe(84_512_50 + 6_00_000_00)
  })

  it('sends amounts above the IMPS limit by NEFT', () => {
    expect(buildBankFile({ ...base, layout: 'generic' }).rows[1][4]).toBe('NEFT')
    expect(buildBankFile({ ...base, layout: 'icici' }).rows[1][4]).toBe('N')
  })

  it('uses the HDFC- and ICICI-style column order and date formats', () => {
    expect(buildBankFile({ ...base, layout: 'hdfc' }).rows[0].slice(0, 5)).toEqual(['M', 'VW-0002', '50100234567890', '84512.50', 'ADITI SHARMA'])
    const icici = buildBankFile({ ...base, layout: 'icici' }).rows[0]
    expect(icici.slice(0, 3)).toEqual(['00112233445566', '50100234567890', 'ADITI SHARMA'])
    expect(icici[5]).toBe('31-10-2026')
  })
})

describe('cleanNarration', () => {
  it('keeps letters, digits and spaces, up to 30 characters', () => {
    expect(cleanNarration('Salary: Oct/2026 — Vistaar WebX Services LLP')).toBe('Salary Oct 2026 Vistaar WebX S')
  })
})
