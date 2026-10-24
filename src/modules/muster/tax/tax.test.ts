import { describe, expect, it } from 'vitest'
import { computeRegimeTax, slabTax } from './compute'
import { DEFAULT_TAX_RULES, readTaxRules } from './rules'
import { buildWorksheet, EMPTY_DECLARATION, futureMonthsInYear, monthsOfTaxYear, taxYearOf, ZERO_MONTH, type DeclaredAmounts, type SalaryMonth, type WorksheetInput } from './worksheet'

const rules = DEFAULT_TAX_RULES
const L = 100_000
const paise = (rupees: number) => rupees * 100

const month = (gross: number, extra: Partial<SalaryMonth> = {}): SalaryMonth => ({ ...ZERO_MONTH, gross: paise(gross), ...extra })

function input(over: Partial<WorksheetInput> & { monthly?: SalaryMonth } = {}): WorksheetInput {
  const m = over.monthly ?? month(L)
  return { rules, regime: 'new', declared: EMPTY_DECLARATION, ytd: { ...ZERO_MONTH, tds: 0, months: 0 }, current: m, projected: m, futureMonths: 11, ...over }
}

describe('slab tax, rebate, surcharge and cess (FY 2026-27 defaults)', () => {
  it('charges nothing in the new regime up to ₹12 lakh of taxable income (rebate edge)', () => {
    expect(slabTax(12 * L, rules.regimes.new.slabs)).toBe(60_000)
    expect(computeRegimeTax(12 * L, rules, 'new').totalTax).toBe(0)
  })

  it('applies marginal relief just above ₹12 lakh so tax never exceeds the excess income', () => {
    const t = computeRegimeTax(12 * L + 10_000, rules, 'new')
    expect(t.slabTax).toBe(61_500)
    expect(t.taxAfterRebate).toBe(10_000)
    expect(t.totalTax).toBe(10_400)
    expect(computeRegimeTax(12 * L + 1, rules, 'new').totalTax).toBe(1)
  })

  it('stops the relief once the slab tax is below the excess', () => {
    expect(computeRegimeTax(15 * L, rules, 'new').totalTax).toBe(109_200)
    expect(computeRegimeTax(30 * L, rules, 'new').totalTax).toBe(499_200)
  })

  it('handles the old regime slabs and its ₹5 lakh rebate', () => {
    expect(computeRegimeTax(5 * L, rules, 'old').totalTax).toBe(0)
    expect(computeRegimeTax(5 * L + 100, rules, 'old').totalTax).toBe(Math.round((12_500 + 20) * 1.04))
    expect(computeRegimeTax(10 * L, rules, 'old').totalTax).toBe(117_000)
  })

  it('adds surcharge above ₹50 lakh with marginal relief at the threshold', () => {
    expect(computeRegimeTax(60 * L, rules, 'new').totalTax).toBe(1_578_720)
    const near = computeRegimeTax(50 * L + 10_000, rules, 'new')
    expect(near.surcharge).toBe(7_000)
    expect(near.totalTax).toBe(1_133_600)
  })

  it('caps new-regime surcharge at 25% while the old regime reaches 37%', () => {
    expect(computeRegimeTax(6 * 10 * 10 * L, rules, 'new').surcharge / computeRegimeTax(6 * 10 * 10 * L, rules, 'new').taxAfterRebate).toBeCloseTo(0.25, 2)
    expect(computeRegimeTax(6 * 10 * 10 * L, rules, 'old').surcharge / computeRegimeTax(6 * 10 * 10 * L, rules, 'old').taxAfterRebate).toBeCloseTo(0.37, 2)
  })
})

describe('tax rules as data', () => {
  it('falls back to the defaults, with a reason, when stored rules are malformed', () => {
    expect(readTaxRules(null)).toEqual({ rules: rules, error: null })
    expect(readTaxRules({ fy: 'x' }).error).toBeTruthy()
    const unordered = { ...rules, regimes: { ...rules.regimes, new: { ...rules.regimes.new, slabs: [{ upTo: 800_000, ratePercent: 5 }, { upTo: 400_000, ratePercent: 0 }, { upTo: null, ratePercent: 30 }] } } }
    expect(readTaxRules(unordered).error).toMatch(/rise/)
  })

  it('applies edited slabs without a code change', () => {
    const edited = readTaxRules({ ...rules, regimes: { ...rules.regimes, new: { ...rules.regimes.new, rebate: { ...rules.regimes.new.rebate, maxRebate: 0 } } } }).rules
    expect(computeRegimeTax(12 * L, edited, 'new').totalTax).toBe(62_400)
  })
})

describe('salary TDS worksheet', () => {
  it('raises TDS to 20% of taxable income when there is no PAN (R1 3.5)', () => {
    const withPan = buildWorksheet(input({ monthly: month(2 * L) }))
    const noPan = buildWorksheet({ ...input({ monthly: month(2 * L) }), hasPan: false })
    expect(withPan.remainingTax).toBe(292_500)
    expect(noPan.remainingTax).toBe(Math.round(23_25_000 * 0.2))
    expect(noPan.notes.join(' ')).toMatch(/No PAN on record/)
    expect(buildWorksheet({ ...input(), hasPan: false }).monthlyTdsPaise).toBe(0)
  })


  it('deducts nothing on ₹1 lakh a month in the new regime', () => {
    const w = buildWorksheet(input())
    expect(w.grossSalary).toBe(12 * L)
    expect(w.tax.taxableIncome).toBe(11_25_000)
    expect(w.monthlyTdsPaise).toBe(0)
  })

  it('spreads the year over twelve months on ₹2 lakh a month in the new regime', () => {
    const w = buildWorksheet(input({ monthly: month(2 * L) }))
    expect(w.tax.taxableIncome).toBe(23_25_000)
    expect(w.tax.totalTax).toBe(292_500)
    expect(w.monthlyTdsPaise).toBe(paise(24_375))
  })

  it('applies HRA, 80C, PT and the standard deduction in the old regime', () => {
    const declared: DeclaredAmounts = { ...EMPTY_DECLARATION, sec80c: 150_000, rentMonthly: 50_000, metro: true, landlordPan: 'ABCPE1234F' }
    const monthly = month(2 * L, { basic: paise(L), hra: paise(40_000), professionalTax: paise(200) })
    const w = buildWorksheet(input({ regime: 'old', declared, monthly }))
    expect(w.hraExemption).toBe(480_000)
    expect(w.professionalTax).toBe(2_400)
    expect(w.totalDeductions).toBe(682_400)
    expect(w.tax.taxableIncome).toBe(17_17_600)
    expect(w.tax.totalTax).toBe(340_891)
    expect(w.monthlyTdsPaise).toBe(paise(28_408))
    expect(w.otherRegime).toEqual({ regime: 'new', totalTax: 292_500 })
  })

  it('counts employee PF towards 80C, capped', () => {
    const monthly = month(2 * L, { pfEmployee: paise(1_800) })
    const w = buildWorksheet(input({ regime: 'old', declared: { ...EMPTY_DECLARATION, sec80c: 140_000 }, monthly }))
    expect(w.sec80c).toBe(150_000)
  })

  it('withholds the HRA exemption until the landlord PAN is given for rent above ₹1 lakh a year', () => {
    const monthly = month(L, { basic: paise(50_000), hra: paise(20_000) })
    const w = buildWorksheet(input({ regime: 'old', declared: { ...EMPTY_DECLARATION, rentMonthly: 15_000 }, monthly }))
    expect(w.hraExemption).toBe(0)
    expect(w.notes.join(' ')).toMatch(/landlord/)
  })

  it('handles a mid-year joiner with income and TDS from a previous employer', () => {
    const base = input({ monthly: month(2 * L), futureMonths: futureMonthsInYear(2026, 10) })
    expect(buildWorksheet(base).monthlyTdsPaise).toBe(0)
    const prev = { taxableSalary: 6 * L, tds: 0, professionalTax: 0 }
    const w = buildWorksheet({ ...base, declared: { ...EMPTY_DECLARATION, previousEmployer: prev } })
    expect(w.grossSalary).toBe(18 * L)
    expect(w.tax.totalTax).toBe(150_800)
    expect(w.monthsLeft).toBe(6)
    expect(w.monthlyTdsPaise).toBe(paise(25_133))
    const withTds = buildWorksheet({ ...base, declared: { ...EMPTY_DECLARATION, previousEmployer: { ...prev, tds: 50_800 } } })
    expect(withTds.monthlyTdsPaise).toBe(paise(16_667))
  })

  it('re-spreads the balance when declarations change mid-year', () => {
    const monthly = month(2 * L, { basic: paise(L) })
    const april = buildWorksheet(input({ regime: 'old', monthly }))
    const paidSoFar = april.monthlyTdsPaise * 6
    const october = buildWorksheet(input({ regime: 'old', monthly, futureMonths: 5, ytd: { ...monthly, gross: monthly.gross * 6, basic: monthly.basic * 6, tds: paidSoFar, months: 6 }, declared: { ...EMPTY_DECLARATION, sec80c: 150_000 } }))
    expect(october.tax.totalTax).toBeLessThan(april.tax.totalTax)
    expect(october.monthlyTdsPaise).toBe(Math.round((october.tax.totalTax - paidSoFar / 100) / 6) * 100)
    expect(october.monthlyTdsPaise).toBeLessThan(april.monthlyTdsPaise)
  })

  it('never deducts a negative amount when more was cut than owed', () => {
    const w = buildWorksheet(input({ ytd: { ...ZERO_MONTH, tds: paise(500_000), months: 6 }, futureMonths: 5 }))
    expect(w.monthlyTdsPaise).toBe(0)
    expect(w.notes.length).toBe(1)
  })
})

describe('tax year helpers', () => {
  it('counts the months left in the year, cut short by an exit', () => {
    expect(futureMonthsInYear(2026, 4)).toBe(11)
    expect(futureMonthsInYear(2027, 3)).toBe(0)
    expect(futureMonthsInYear(2026, 10, '2026-12-15')).toBe(2)
    expect(taxYearOf(2027, 2)).toBe('2026-27')
    expect(monthsOfTaxYear('2026-27')[0]).toEqual({ year: 2026, month: 4 })
    expect(monthsOfTaxYear('2026-27')[11]).toEqual({ year: 2027, month: 3 })
  })
})

describe('declaration and proof windows', () => {
  it('keeps declarations open until HR closes them', async () => {
    const { declarationWindow } = await import('./windows')
    expect(declarationWindow(null).open).toBe(true)
    expect(declarationWindow({ declarationsOpen: false }).open).toBe(false)
  })

  it('opens proofs only inside the dates HR set', async () => {
    const { proofWindow } = await import('./windows')
    const s = { proofOpens: '2027-01-01', proofCloses: '2027-01-31' }
    expect(proofWindow(null, '2027-01-10').open).toBe(false)
    expect(proofWindow(s, '2026-12-31').open).toBe(false)
    expect(proofWindow(s, '2027-01-31').open).toBe(true)
    expect(proofWindow(s, '2027-02-01').open).toBe(false)
  })
})

describe('Form 138 (24Q) export', () => {
  it('picks the quarter months of the tax year', async () => {
    const { quarterMonths } = await import('./form138')
    expect(quarterMonths('2026-27', 'Q1')).toEqual([{ year: 2026, month: 4 }, { year: 2026, month: 5 }, { year: 2026, month: 6 }])
    expect(quarterMonths('2026-27', 'Q4')).toEqual([{ year: 2027, month: 1 }, { year: 2027, month: 2 }, { year: 2027, month: 3 }])
  })

  it('writes deductee rows in payment order, flagging a missing PAN', async () => {
    const { deducteeRows } = await import('./form138')
    const rows = deducteeRows([
      { employeeCode: 'E2', name: 'Zoya', pan: '', regime: 'new', paidOn: '2026-05-31', amountPaid: paise(L), tds: 0 },
      { employeeCode: 'E1', name: 'Aman', pan: 'ABCPE1234F', regime: 'old', paidOn: '2026-04-30', amountPaid: paise(2 * L), tds: paise(28_408) },
    ])
    expect(rows[0]).toEqual([1, 'E1', 'ABCPE1234F', 'Aman', '392', '2026-04-30', '200000.00', '28408.00', '28408.00', '2026-04-30', 'Y', 'N'])
    expect(rows[1][2]).toBe('PANNOTAVBL')
    expect(rows[1][11]).toBe('Y')
  })

  it('writes the year salary details from the worksheet', async () => {
    const { salaryRows } = await import('./form138')
    const w = buildWorksheet(input({ monthly: month(2 * L) }))
    const [row] = salaryRows([{ employeeCode: 'E1', name: 'Aman', pan: 'ABCPE1234F', from: '2026-04-01', to: '2027-03-31', worksheet: w, tdsDeducted: paise(292_500) }])
    expect(row[6]).toBe('2400000.00')
    expect(row[20]).toBe('292500.00')
  })
})
