import { describe, expect, test } from 'vitest'
import { adjustmentCode, computePayroll, resolveStructure, type PayrollComputationInput, type StructureLineInput } from './engine'
import { toPaise } from './money'
import { DEFAULT_STATUTORY, MP_PT_SLABS } from './statutory'

const component = (code: string, overrides: Partial<StructureLineInput['component']> = {}): StructureLineInput['component'] => ({
  code,
  name: code,
  componentType: 'earning',
  countsForPf: false,
  countsForEsi: true,
  prorateOnLop: true,
  displayOrder: 10,
  ...overrides,
})

/** The reference structure: 50% basic, HRA at 40% of basic, the rest special (fixed, in paise). */
function standardStructure(grossRupees = 45000): StructureLineInput[] {
  return [
    { component: component('BASIC', { countsForPf: true, displayOrder: 10 }), calculationType: 'percent_of_gross', value: 50 },
    { component: component('HRA', { displayOrder: 20 }), calculationType: 'percent_of_basic', value: 40 },
    { component: component('SPECIAL', { displayOrder: 30 }), calculationType: 'fixed', value: toPaise(grossRupees - grossRupees * 0.5 - grossRupees * 0.5 * 0.4) },
  ]
}

/** The ₹15,000 ceiling in force before 17 Sep 2026: these tests pin it, since earlier months still run on it. */
const statutory = {
  pf: { ...DEFAULT_STATUTORY.pf, wageCeiling: 15000 },
  esi: DEFAULT_STATUTORY.esi,
  pt: { state: 'MP', enabled: true, slabs: MP_PT_SLABS, monthOverrides: [] },
  lwf: null,
}

function input(overrides: Partial<PayrollComputationInput> = {}): PayrollComputationInput {
  return {
    monthlyGross: toPaise(45000),
    ctcAnnual: toPaise(540000),
    structure: standardStructure(),
    attendance: { workingDays: 26, payableDays: 26, lopDays: 0 },
    adjustments: [],
    reimbursementTotal: 0,
    month: 5,
    statutory,
    netPayRounding: 'nearest_rupee',
    ...overrides,
  }
}

const withGross = (rupees: number) => ({ monthlyGross: toPaise(rupees), structure: standardStructure(rupees) })
const amountOf = (result: ReturnType<typeof computePayroll>, code: string) => result.lines.find((l) => l.code === code)?.amount ?? 0

describe('computePayroll · structure resolution', () => {
  test('resolves percent-of-gross and percent-of-basic components', () => {
    const result = computePayroll(input())
    expect(amountOf(result, 'BASIC')).toBe(toPaise(22500))
    expect(amountOf(result, 'HRA')).toBe(toPaise(9000))
    expect(amountOf(result, 'SPECIAL')).toBe(toPaise(13500))
  })

  test('earned gross equals monthly gross at full attendance', () => {
    const result = computePayroll(input())
    expect(result.earnedGross).toBe(toPaise(45000))
    expect(result.warnings).toEqual([])
  })

  test('warns when the components do not add up to the monthly gross', () => {
    const structure = standardStructure()
    structure[2] = { ...structure[2], value: toPaise(10000) }
    const result = computePayroll(input({ structure }))
    expect(result.warnings.join(' ')).toMatch(/do not add up to the monthly gross \(off by ₹3,500.00\)/)
  })

  test('resolves percent-of-CTC against a twelfth of the annual CTC', () => {
    const lines: StructureLineInput[] = [{ component: component('BASIC'), calculationType: 'percent_of_ctc', value: 50 }]
    expect(resolveStructure(toPaise(45000), toPaise(600000), lines).get('BASIC')).toBe(toPaise(25000))
  })
})

describe('computePayroll · proration', () => {
  test('prorates earnings across payable days', () => {
    const result = computePayroll(input({ attendance: { workingDays: 26, payableDays: 25, lopDays: 1 } }))
    expect(amountOf(result, 'BASIC')).toBe(toPaise(21634.62))
    expect(result.earnedGross).toBe(toPaise(43269.24))
  })

  test('does not prorate components flagged as not pro-ratable', () => {
    const structure = [...standardStructure(), { component: component('BONUS', { prorateOnLop: false, countsForEsi: false, displayOrder: 70 }), calculationType: 'fixed' as const, value: toPaise(5000) }]
    const result = computePayroll(input({ structure, attendance: { workingDays: 26, payableDays: 13, lopDays: 13 } }))
    expect(amountOf(result, 'BONUS')).toBe(toPaise(5000))
  })

  test('pays nothing when no day is payable', () => {
    const result = computePayroll(input({ attendance: { workingDays: 26, payableDays: 0, lopDays: 26 } }))
    expect(result.earnedGross).toBe(0)
    expect(result.netPay).toBe(0)
  })
})

describe('computePayroll · provident fund', () => {
  test('applies the wage ceiling so PF is 12% of 15,000', () => {
    const result = computePayroll(input())
    expect(amountOf(result, 'PF_EE')).toBe(toPaise(1800))
    expect(amountOf(result, 'PF_ER')).toBe(toPaise(1800))
  })

  test('uses actual PF wages when they fall below the ceiling', () => {
    expect(amountOf(computePayroll(input(withGross(20000))), 'PF_EE')).toBe(toPaise(1200))
  })

  test('ignores the ceiling when the company turns it off', () => {
    const result = computePayroll(input({ statutory: { ...statutory, pf: { ...statutory.pf, applyCeiling: false } } }))
    expect(amountOf(result, 'PF_EE')).toBe(toPaise(2700))
  })

  test('prorates the ceiling in an LOP month when asked to', () => {
    const result = computePayroll(input({ statutory: { ...statutory, pf: { ...statutory.pf, prorateCeiling: true } }, attendance: { workingDays: 26, payableDays: 13, lopDays: 13 } }))
    expect(amountOf(result, 'PF_EE')).toBe(toPaise(900))
  })

  test('deducts no PF when the employee is exempt', () => {
    const result = computePayroll(input({ pfExempt: true }))
    expect(amountOf(result, 'PF_EE')).toBe(0)
    expect(amountOf(result, 'PF_ER')).toBe(0)
  })

  test('deducts no PF when the scheme is disabled company-wide', () => {
    expect(amountOf(computePayroll(input({ statutory: { ...statutory, pf: { ...statutory.pf, enabled: false } } })), 'PF_EE')).toBe(0)
  })
})

describe('computePayroll · provident fund at the ₹25,000 ceiling (S.O. 5109(E), from 17 Sep 2026)', () => {
  /** Basic is half of gross in the reference structure, and only basic counts for PF. */
  const withPfWage = (rupees: number) => withGross(rupees * 2)
  const pfAt = (pfWageRupees: number, applyCeiling: boolean, overrides: Partial<PayrollComputationInput> = {}) =>
    computePayroll(input({ ...withPfWage(pfWageRupees), statutory: { ...statutory, pf: { ...DEFAULT_STATUTORY.pf, applyCeiling } }, ...overrides }))

  test.each([
    { case: 'below', pfWage: 20000, applyCeiling: true, pf: 2400 },
    { case: 'below', pfWage: 20000, applyCeiling: false, pf: 2400 },
    { case: 'at', pfWage: 25000, applyCeiling: true, pf: 3000 },
    { case: 'at', pfWage: 25000, applyCeiling: false, pf: 3000 },
    { case: 'above', pfWage: 40000, applyCeiling: true, pf: 3000 },
    { case: 'above', pfWage: 40000, applyCeiling: false, pf: 4800 },
  ])('PF wage $case the ceiling (₹$pfWage), applyCeiling $applyCeiling: ₹$pf each side', ({ pfWage, applyCeiling, pf }) => {
    const result = pfAt(pfWage, applyCeiling)
    expect(result.pfWage).toBe(toPaise(pfWage))
    expect(amountOf(result, 'PF_EE')).toBe(toPaise(pf))
    expect(amountOf(result, 'PF_ER')).toBe(toPaise(pf))
  })

  test('a PF wage between ₹15,000 and ₹25,000 is no longer capped at ₹1,800', () => {
    const before = computePayroll(input({ ...withPfWage(20000), statutory }))
    expect(amountOf(before, 'PF_EE')).toBe(toPaise(1800))
    expect(amountOf(pfAt(20000, true), 'PF_EE')).toBe(toPaise(2400))
  })

  test('prorates the new ceiling in an LOP month when asked to', () => {
    const result = computePayroll(input({ ...withPfWage(40000), statutory: { ...statutory, pf: { ...DEFAULT_STATUTORY.pf, prorateCeiling: true } }, attendance: { workingDays: 26, payableDays: 13, lopDays: 13 } }))
    expect(result.pfWage).toBe(toPaise(20000))
    expect(amountOf(result, 'PF_EE')).toBe(toPaise(1500))
  })
})

describe('computePayroll · ESI', () => {
  test('is not deducted above the gross eligibility limit', () => {
    const result = computePayroll(input())
    expect(amountOf(result, 'ESI_EE')).toBe(0)
    expect(amountOf(result, 'ESI_ER')).toBe(0)
  })

  test('is deducted at 0.75 and 3.25 percent within the limit, rounded up', () => {
    const result = computePayroll(input(withGross(18000)))
    expect(amountOf(result, 'ESI_EE')).toBe(toPaise(135))
    expect(amountOf(result, 'ESI_ER')).toBe(toPaise(585))
  })

  test('rounds the employee share up to the next whole rupee', () => {
    expect(amountOf(computePayroll(input(withGross(12345))), 'ESI_EE')).toBe(toPaise(93))
  })

  test('keeps eligibility on the full monthly gross, not the LOP-reduced gross', () => {
    expect(amountOf(computePayroll(input({ attendance: { workingDays: 26, payableDays: 5, lopDays: 21 } })), 'ESI_EE')).toBe(0)
  })

  test('is skipped for someone outside the scheme', () => {
    expect(amountOf(computePayroll(input({ ...withGross(18000), esiExempt: true })), 'ESI_EE')).toBe(0)
  })
})

describe('computePayroll · professional tax', () => {
  test('picks the slab matching the earned gross', () => {
    expect(amountOf(computePayroll(input()), 'PT')).toBe(toPaise(208))
  })

  test('charges nothing below the first slab', () => {
    expect(amountOf(computePayroll(input(withGross(15000))), 'PT')).toBe(0)
  })

  test('is skipped when the schedule is disabled', () => {
    expect(amountOf(computePayroll(input({ statutory: { ...statutory, pt: { ...statutory.pt, enabled: false } } })), 'PT')).toBe(0)
  })

  test('is skipped for someone exempt', () => {
    expect(amountOf(computePayroll(input({ ptExempt: true })), 'PT')).toBe(0)
  })

  test('collects the month override in the top slab (MP ₹212 month)', () => {
    const pt = { ...statutory.pt, monthOverrides: [{ month: 2, amount: 212 }] }
    expect(amountOf(computePayroll(input({ month: 2, statutory: { ...statutory, pt } })), 'PT')).toBe(toPaise(212))
    expect(amountOf(computePayroll(input({ month: 3, statutory: { ...statutory, pt } })), 'PT')).toBe(toPaise(208))
  })

  test('warns when the employee state has no schedule', () => {
    const result = computePayroll(input({ ptState: 'KA', statutory: { ...statutory, pt: null } }))
    expect(amountOf(result, 'PT')).toBe(0)
    expect(result.warnings.join(' ')).toMatch(/No professional tax schedule is set for KA/)
  })
})

describe('computePayroll · adjustments, reimbursements and net pay', () => {
  const bonus = { code: 'BONUS', label: 'Bonus', lineType: 'earning' as const, amount: toPaise(2000), reason: 'Festive' }
  const incentive = { code: 'INCENTIVE', label: 'Incentive', lineType: 'earning' as const, amount: toPaise(5000), reason: 'Q2' }

  test('adds one-time earnings on top of the earned salary', () => {
    const result = computePayroll(input({ adjustments: [bonus, incentive] }))
    expect(result.totalEarnings).toBe(toPaise(52000))
    expect(result.earnedGross).toBe(toPaise(45000))
  })

  test('adds approved reimbursements to net pay without taxing them', () => {
    const without = computePayroll(input())
    const withClaim = computePayroll(input({ reimbursementTotal: toPaise(4850) }))
    expect(withClaim.reimbursementAmount).toBe(toPaise(4850))
    expect(withClaim.netPay - without.netPay).toBe(toPaise(4850))
    expect(withClaim.totalDeductions).toBe(without.totalDeductions)
  })

  test('computes the full worked example end to end', () => {
    const result = computePayroll(
      input({
        attendance: { workingDays: 26, payableDays: 25, lopDays: 1 },
        adjustments: [bonus, incentive, { code: 'TDS', label: 'TDS', lineType: 'deduction', amount: toPaise(2350), reason: 'Declared' }],
        reimbursementTotal: toPaise(4850),
      }),
    )
    expect(result.earnedGross).toBe(toPaise(43269.24))
    expect(result.totalEarnings).toBe(toPaise(50269.24))
    expect(result.totalDeductions).toBe(toPaise(4358))
    expect(result.netPay).toBe(toPaise(50761))
    expect(result.totalEmployerContributions).toBe(toPaise(1800))
  })

  test('rounds net pay to the nearest rupee by default', () => {
    expect(computePayroll(input({ attendance: { workingDays: 26, payableDays: 25, lopDays: 1 } })).netPay % 100).toBe(0)
  })

  test('leaves net pay unrounded when rounding is switched off', () => {
    const result = computePayroll(input({ attendance: { workingDays: 26, payableDays: 25, lopDays: 1 }, netPayRounding: 'none' }))
    expect(result.netPay).toBe(toPaise(43269.24) - toPaise(1800) - toPaise(208))
  })

  test('never lets deductions push net pay below zero', () => {
    const result = computePayroll(input({ adjustments: [{ code: 'LOAN', label: 'Loan Recovery', lineType: 'deduction', amount: toPaise(900000), reason: 'Loan' }] }))
    expect(result.netPay).toBe(0)
    expect(result.warnings.join(' ')).toMatch(/exceed/i)
  })

  test('records the reason on every adjustment line for the audit trail', () => {
    const line = computePayroll(input({ adjustments: [bonus] })).lines.find((l) => l.code === 'BONUS')
    expect(line?.isAdjustment).toBe(true)
    expect(line?.reason).toBe('Festive')
  })

  test('keeps adjustment earnings out of the PF wage', () => {
    const result = computePayroll(input({ ...withGross(20000), adjustments: [bonus] }))
    expect(result.pfWage).toBe(toPaise(10000))
  })
})

describe('computePayroll · determinism', () => {
  test('the same inputs always produce the same output', () => {
    const payload = input({ attendance: { workingDays: 26, payableDays: 22.5, lopDays: 3.5 } })
    expect(computePayroll(payload)).toEqual(computePayroll(payload))
  })
})

describe('labour welfare fund', () => {
  const lwf = (enabled: boolean) => ({ state: 'MP', enabled, employeeAmount: 10, employerAmount: 50, remittanceMonths: [6, 12] })
  const run = (enabled: boolean, month: number) => computePayroll(input({ month, statutory: { ...statutory, lwf: lwf(enabled) } }))
  const find = (result: ReturnType<typeof computePayroll>, code: string) => result.lines.find((l) => l.code === code)

  test('nothing is deducted while it is off', () => {
    expect(find(run(false, 6), 'LWF_EE')).toBeUndefined()
  })

  test('it is deducted in each remittance month', () => {
    expect(find(run(true, 6), 'LWF_EE')?.amount).toBe(1000)
    expect(find(run(true, 6), 'LWF_ER')?.amount).toBe(5000)
    expect(find(run(true, 12), 'LWF_EE')?.amount).toBe(1000)
  })

  test('but not in any other month', () => {
    for (const month of [1, 5, 7, 11]) expect(find(run(true, month), 'LWF_EE'), String(month)).toBeUndefined()
  })

  test('the employee side is a deduction and the employer side is not', () => {
    expect(find(run(true, 6), 'LWF_EE')?.lineType).toBe('deduction')
    expect(find(run(true, 6), 'LWF_ER')?.lineType).toBe('employer_contribution')
  })
})

describe('adjustmentCode', () => {
  test('upper-cases the label and joins words with underscores', () => {
    expect(adjustmentCode('Diwali bonus')).toBe('DIWALI_BONUS')
  })
  test('keeps at most 24 characters', () => {
    expect(adjustmentCode('A very long adjustment label indeed').length).toBeLessThanOrEqual(24)
  })
})
