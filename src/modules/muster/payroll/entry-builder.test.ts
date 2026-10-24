import { Types } from 'mongoose'
import { describe, expect, test } from 'vitest'
import { computePayroll } from './engine'
import { buildEntry, registerTotals } from './entry-builder'
import { toPaise } from './money'
import { DEFAULT_STATUTORY } from './statutory'
import { defaultLines } from './structure-lines'
import { DEFAULT_TAX_RULES } from '@/modules/muster/tax/rules'
import { EMPTY_DECLARATION, ZERO_MONTH } from '@/modules/muster/tax/worksheet'

const gross = toPaise(18000)
const base = {
  cycleId: new Types.ObjectId(),
  month: 10,
  generatedAt: new Date('2026-10-30T06:00:00Z'),
  person: { _id: new Types.ObjectId(), code: 'VW-0004', fullName: 'Rohan Mehta', joinDate: '2024-06-03', ptState: 'MP', pan: 'DLMPM6620R', bank: { bankName: 'HDFC Bank', accountNumber: '50100123456789' }, statutory: { pfCovered: true, esiCovered: true } },
  department: 'People',
  structure: { _id: new Types.ObjectId(), effectiveFrom: '2024-06-03', monthlyGross: gross, ctcAnnual: gross * 12, lines: defaultLines(gross) },
  components: new Map([['BASIC', { code: 'BASIC', name: 'Basic Salary', componentType: 'earning', countsForPf: true, countsForEsi: true, displayOrder: 10 }]]),
  summary: { workingDays: 27, payableDays: 26, lopDays: 1, leaveDays: 0, presentDays: 24, assumedDays: 0 },
  adjustments: [{ label: 'Diwali bonus', lineType: 'earning' as const, amount: toPaise(2000), reason: 'Festival' }],
  reimbursement: { total: toPaise(640), claimIds: ['c1'] },
  settings: DEFAULT_STATUTORY,
  version: { id: 'v1', effectiveFrom: '2000-01-01', payrollFrom: '2000-01-01', note: '' },
}

describe('buildEntry', () => {
  test('stores a snapshot that reproduces the entry', () => {
    const entry = buildEntry(base)
    expect(computePayroll(entry.snapshot.input).netPay).toBe(entry.netPay)
    expect(entry.snapshot.employee.bankAccountMasked).toBe('XXXXXXXX6789')
    expect(entry.lines.some((l) => l.code === 'DIWALI_BONUS' && l.isAdjustment)).toBe(true)
    expect(entry.reimbursementAmount).toBe(toPaise(640))
  })

  test('applies coverage flags and the PT schedule of the person’s state', () => {
    const entry = buildEntry(base)
    expect(entry.lines.find((l) => l.code === 'PF_EE')).toBeDefined()
    expect(entry.lines.find((l) => l.code === 'ESI_EE')).toBeDefined()
    expect(buildEntry({ ...base, person: { ...base.person, statutory: { pfCovered: false, esiCovered: false } } }).lines.find((l) => l.code === 'PF_EE')).toBeUndefined()
  })

  test('a held entry is computed but left out of the register totals', () => {
    const held = buildEntry({ ...base, holdReason: 'Bank details being verified' })
    expect(held.status).toBe('on_hold')
    expect(registerTotals([held, buildEntry(base)]).employeeCount).toBe(1)
  })

  describe('automatic TDS', () => {
    const highGross = toPaise(200_000)
    const high = { ...base, adjustments: [], reimbursement: { total: 0, claimIds: [] }, summary: { ...base.summary, payableDays: 27, lopDays: 0 }, structure: { ...base.structure, monthlyGross: highGross, ctcAnnual: highGross * 12, lines: defaultLines(highGross) } }
    const tax = { fy: '2026-27', rules: DEFAULT_TAX_RULES, regime: 'new' as const, declared: EMPTY_DECLARATION, verified: false, ytd: { ...ZERO_MONTH, tds: 0, months: 0 }, futureMonths: 11 }

    test('adds the worksheet TDS as a deduction and keeps the worksheet in the snapshot', () => {
      const entry = buildEntry({ ...high, tax })
      const tds = entry.lines.find((l) => l.code === 'TDS')
      expect(tds?.amount).toBe(entry.snapshot.tax?.computedPaise)
      expect(tds?.amount).toBeGreaterThan(0)
      expect(computePayroll(entry.snapshot.input).netPay).toBe(entry.netPay)
    })

    test('an override replaces the computed figure and carries its reason', () => {
      const entry = buildEntry({ ...high, tax: { ...tax, override: { amount: toPaise(5000), reason: 'Asked for more' } } })
      const tds = entry.lines.find((l) => l.code === 'TDS')
      expect(tds).toMatchObject({ amount: toPaise(5000), isAdjustment: true, reason: 'Asked for more' })
      expect(entry.snapshot.tax?.overridden).toBe(true)
    })

    test('no TDS line in manual mode, and a warning when TDS is also added by hand', () => {
      expect(buildEntry(high).lines.some((l) => l.code === 'TDS')).toBe(false)
      const both = buildEntry({ ...high, adjustments: [{ label: 'TDS', lineType: 'deduction', amount: toPaise(100), reason: 'x' }], tax })
      expect(both.warnings.join(' ')).toMatch(/also added by hand/)
    })
  })
})
