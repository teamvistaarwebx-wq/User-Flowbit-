import { describe, expect, test } from 'vitest'
import { DEFAULT_GRATUITY_RULES, gratuityFor, serviceLength, statutoryWageBase } from './gratuity'
import { buildPayrollJournal, type JournalInput } from './journal'
import { maskAccount, prorate } from './money'
import { PAID_STATUSES, payslipOwner, advanceRefusal, attendanceGateRefusal, canCloseClaims, canGenerate, isLocked, reopenTarget, stepperIndex } from './stages'
import { landsMidMonth, payrollMonthProblem, pendingTransitions, statutoryBlock, statutoryForMonth, versionFor } from './timeline'

const v = (effectiveFrom: string, payrollFrom: string, confirmed = true) => ({ effectiveFrom, payrollFrom, confirmedAt: confirmed ? '2026-01-01' : null })

describe('statutory timeline', () => {
  const versions = [v('2000-01-01', '2000-01-01'), v('2026-09-17', '2026-10-01', false)]

  test('payroll uses the latest version whose payroll month has started', () => {
    expect(statutoryForMonth(versions, 2026, 9)?.effectiveFrom).toBe('2000-01-01')
    expect(statutoryForMonth(versions, 2026, 10)?.effectiveFrom).toBe('2026-09-17')
  })

  test('letters use the version in force by law on the date', () => {
    expect(versionFor(versions, '2026-09-16')?.effectiveFrom).toBe('2000-01-01')
    expect(versionFor(versions, '2026-09-17')?.effectiveFrom).toBe('2026-09-17')
  })

  test('flags a change that lands mid-month', () => {
    expect(landsMidMonth('2026-09-17')).toBe(true)
    expect(pendingTransitions(versions, 2026, 9)).toHaveLength(1)
    expect(pendingTransitions(versions, 2026, 10)).toHaveLength(0)
  })

  test('blocks payroll with no rates, or unconfirmed rates', () => {
    expect(statutoryBlock(null, 2026, 10)).toMatch(/No statutory rates are configured for 2026-10/)
    expect(statutoryBlock(statutoryForMonth(versions, 2026, 10), 2026, 10)).toMatch(/have not been confirmed yet/)
    expect(statutoryBlock(statutoryForMonth(versions, 2026, 9), 2026, 9)).toBeNull()
  })

  describe('a correction outranks the version it corrects', () => {
    const saved = (note: string, effectiveFrom: string, payrollFrom: string, createdAt: string) => ({ note, effectiveFrom, payrollFrom, createdAt: new Date(createdAt), confirmedAt: new Date(createdAt) })
    const original = saved('original', '2026-09-17', '2026-10-01', '2026-09-20T10:00:00Z')
    const correction = saved('correction', '2026-09-17', '2026-10-01', '2026-10-03T10:00:00Z')

    test('payroll uses the later-saved of two versions for the same month, whatever order they load in', () => {
      expect(statutoryForMonth([correction, original], 2026, 10)?.note).toBe('correction')
      expect(statutoryForMonth([original, correction], 2026, 10)?.note).toBe('correction')
    })

    test('a correction that also moves the legal date earlier still wins its payroll month', () => {
      const earlier = saved('earlier', '2026-09-15', '2026-10-01', '2026-10-03T10:00:00Z')
      expect(statutoryForMonth([original, earlier], 2026, 10)?.note).toBe('earlier')
      expect(statutoryForMonth([earlier, original], 2026, 10)?.note).toBe('earlier')
    })

    test('a later payroll month still outranks a newer record for an earlier month', () => {
      const november = saved('november', '2026-11-01', '2026-11-01', '2026-09-25T10:00:00Z')
      expect(statutoryForMonth([november, correction], 2026, 11)?.note).toBe('november')
      expect(statutoryForMonth([correction, november], 2026, 11)?.note).toBe('november')
    })

    test('an unconfirmed correction blocks its month until it is confirmed', () => {
      const proposal = { ...correction, note: 'proposal', confirmedAt: null }
      expect(statutoryBlock(statutoryForMonth([proposal, original], 2026, 10), 2026, 10)).toMatch(/have not been confirmed yet/)
    })

    test('letters use the later-saved of two versions with the same legal date', () => {
      expect(versionFor([correction, original], '2026-09-20')?.note).toBe('correction')
      expect(versionFor([original, correction], '2026-09-20')?.note).toBe('correction')
    })
  })

  test('checks the payroll month of a version', () => {
    expect(payrollMonthProblem('2026-09-17', '2026-10-01')).toBeNull()
    expect(payrollMonthProblem('2026-09-17', '2026-10-15')).toMatch(/1st of a month/)
    expect(payrollMonthProblem('2026-09-17', '2026-08-01')).toMatch(/before the month/)
    expect(payrollMonthProblem('2026-09-17', '2027-10-01')).toMatch(/within 12 months/)
  })
})

describe('payroll stages', () => {
  test('locks from the locked stage on', () => {
    expect(isLocked('finance_approved')).toBe(false)
    expect(isLocked('locked')).toBe(true)
    expect(isLocked('payslips_published')).toBe(true)
  })

  test('generation is allowed only before lock; claims close only before generation', () => {
    expect(canGenerate('hr_reviewed')).toBe(true)
    expect(canGenerate('locked')).toBe(false)
    expect(canCloseClaims('attendance_locked')).toBe(true)
    expect(canCloseClaims('generated')).toBe(false)
  })

  test('refuses a sign-off pressed on a stale page and says where the month is', () => {
    expect(advanceRefusal('hr_reviewed', 'generated', 'October 2026')).toBeNull()
    expect(advanceRefusal('finance_approved', 'locked', 'October 2026')).toMatch(/already past "Finance approved"/)
    expect(advanceRefusal('locked', 'generated', 'October 2026')).toMatch(/cannot be marked "Locked" yet/)
  })

  test('the stepper is done once payslips are published', () => {
    expect(stepperIndex('attendance_open')).toBe(0)
    expect(stepperIndex('payslips_published')).toBe(8)
  })
})

describe('money helpers', () => {
  test('prorate guards odd inputs', () => {
    expect(prorate(1000, 5, 0)).toBe(0)
    expect(prorate(1000, 30, 26)).toBe(1000)
    expect(prorate(1000, 13, 26)).toBe(500)
  })
  test('maskAccount keeps the last four digits', () => {
    expect(maskAccount('123456789012')).toBe('XXXXXXXX9012')
    expect(maskAccount('1234')).toBe('1234')
    expect(maskAccount('')).toBe('')
  })
})

describe('buildPayrollJournal', () => {
  const one: JournalInput = {
    month: 'August 2026',
    entries: [
      {
        grossEarnings: 45_000_00,
        reimbursement: 4_850_00,
        netPay: 45_492_00,
        lines: [
          { code: 'PF_EE', lineType: 'deduction', amount: 1_800_00 },
          { code: 'PT', lineType: 'deduction', amount: 208_00 },
          { code: 'TDS', lineType: 'deduction', amount: 2_350_00 },
          { code: 'PF_ER', lineType: 'employer_contribution', amount: 1_800_00 },
        ],
      },
    ],
  }

  test('balances, debits gross salary and credits both PF shares', () => {
    const journal = buildPayrollJournal(one)
    expect(journal.balanced).toBe(true)
    expect(journal.lines.find((l) => l.account === 'Salary and Wages')?.debit).toBe(45_000_00)
    expect(journal.lines.find((l) => l.account === 'PF Payable')?.credit).toBe(3_600_00)
    expect(journal.lines.map((l) => l.account)).toEqual(expect.arrayContaining(['Professional Tax Payable', 'TDS Payable', 'Employer PF Contribution']))
  })

  test('posts a small rounding gap to Rounding Off', () => {
    const journal = buildPayrollJournal({ ...one, entries: [{ ...one.entries[0], netPay: 45_492_40 }] })
    expect(journal.balanced).toBe(true)
    expect(journal.lines.find((l) => l.account === 'Rounding Off')?.debit).toBe(40)
  })

  test('reports a real mismatch as unbalanced', () => {
    expect(buildPayrollJournal({ ...one, entries: [{ ...one.entries[0], netPay: 40_000_00 }] }).balanced).toBe(false)
  })
})

describe('gratuity', () => {
  test('measures service in years, months and days', () => {
    const s = serviceLength('2020-01-15', '2026-08-20')
    expect([s.years, s.months, s.extraDays]).toEqual([6, 7, 5])
  })

  test('counts completed years and months exactly from the joining date', () => {
    const s = serviceLength('2024-08-01', '2026-10-02')
    expect([s.years, s.months, s.extraDays]).toEqual([2, 2, 1])
    expect(gratuityFor({ joined: '2024-08-01', until: '2026-10-02', monthlyWagePaise: 26_000_00 }).qualifiesOn).toBe('2029-08-01')
  })

  test('completes months on month ends and anniversaries in leap years', () => {
    expect(serviceLength('2021-01-31', '2026-02-28')).toMatchObject({ years: 5, months: 1, extraDays: 0 })
    expect(serviceLength('2020-02-29', '2025-02-28')).toMatchObject({ years: 5, months: 0, extraDays: 0, daysSinceAnniversary: 0 })
    expect(gratuityFor({ joined: '2020-02-29', until: '2025-02-28', monthlyWagePaise: 26_000_00 }).qualifiedBy).toBe('completed_years')
    expect(gratuityFor({ joined: '2024-02-29', until: '2026-10-02', monthlyWagePaise: 26_000_00 }).qualifiesOn).toBe('2029-02-28')
  })

  test('counts the 240 days from the last anniversary across a leap day', () => {
    const s = serviceLength('2021-06-01', '2026-01-27')
    expect(s.years).toBe(4)
    expect(s.daysSinceAnniversary).toBe(240)
    expect(gratuityFor({ joined: '2021-06-01', until: '2026-01-27', monthlyWagePaise: 26_000_00 }).qualifiedBy).toBe('240_days')
    expect(gratuityFor({ joined: '2021-06-01', until: '2026-01-26', monthlyWagePaise: 26_000_00 }).isEligible).toBe(false)
  })

  test('is not due before five years, and says when it will be', () => {
    const r = gratuityFor({ joined: '2023-01-01', until: '2026-10-01', monthlyWagePaise: 26_000_00 })
    expect(r.isEligible).toBe(false)
    expect(r.qualifiesOn).toBe('2028-01-01')
  })

  test('qualifies at four years and 240 days', () => {
    expect(gratuityFor({ joined: '2022-01-01', until: '2026-09-01', monthlyWagePaise: 26_000_00 }).qualifiedBy).toBe('240_days')
  })

  test('15 days per year on a 26-day month, counting more than six months as a year', () => {
    const r = gratuityFor({ joined: '2020-01-01', until: '2026-08-02', monthlyWagePaise: 26_000_00 })
    expect(r.years).toBe(7)
    expect(r.amount).toBe(105_000_00)
  })

  test('exactly six months does not round up', () => {
    expect(gratuityFor({ joined: '2020-01-01', until: '2026-07-01', monthlyWagePaise: 26_000_00 }).years).toBe(6)
  })

  test('caps at the ceiling', () => {
    const r = gratuityFor({ joined: '1990-01-01', until: '2026-01-01', monthlyWagePaise: 5_00_000_00 }, DEFAULT_GRATUITY_RULES)
    expect(r.amount).toBe(DEFAULT_GRATUITY_RULES.ceilingPaise)
    expect(r.isCapped).toBe(true)
  })

  test('wage base is at least half of total pay', () => {
    expect(statutoryWageBase([{ amount: 20_000, countsForWages: true }, { amount: 80_000, countsForWages: false }])).toBe(50_000)
    expect(statutoryWageBase([{ amount: 60_000, countsForWages: true }, { amount: 40_000, countsForWages: false }])).toBe(60_000)
  })
})

describe('reopened attendance makes generated payroll stale (R1 3.1)', () => {
  const generatedAt = new Date('2026-10-02T10:00:00Z')
  const locked = (lockedAt: string, reopenedAt?: string) => ({ status: 'locked', lockedAt: new Date(lockedAt), reopenedAt: reopenedAt ? new Date(reopenedAt) : null })

  test('refuses while attendance is open', () => {
    expect(attendanceGateRefusal({ status: 'open' }, generatedAt, 'Sep 2026')).toMatch(/attendance is open again/)
    expect(attendanceGateRefusal(null, null, 'Sep 2026')).toMatch(/attendance is open again/)
  })

  test('allows a month generated after its last lock', () => {
    expect(attendanceGateRefusal(locked('2026-10-01T10:00:00Z'), generatedAt, 'Sep 2026')).toBeNull()
  })

  test('refuses a month whose attendance was reopened and relocked after generation', () => {
    expect(attendanceGateRefusal(locked('2026-10-03T10:00:00Z', '2026-10-03T09:00:00Z'), generatedAt, 'Sep 2026')).toMatch(/Regenerate payroll/)
  })

  test('sends generated and signed-off months back before generation on reopen', () => {
    expect(reopenTarget('generated', false)).toBe('attendance_open')
    expect(reopenTarget('hr_reviewed', true)).toBe('reimbursements_closed')
    expect(reopenTarget('finance_approved', false)).toBe('attendance_open')
    expect(reopenTarget('attendance_locked', false)).toBe('attendance_open')
    expect(reopenTarget('reimbursements_closed', true)).toBeNull()
    expect(reopenTarget('locked', false)).toBeNull()
  })
})

describe('paid months for YTD tax (R1 3.6)', () => {
  test('counts only released and published months', () => {
    expect(PAID_STATUSES).toEqual(['released', 'payslips_published'])
  })
})

describe('payslip callout owner (R1 2.6)', () => {
  test('names Finance once HR has reviewed', () => {
    expect(payslipOwner('generated')).toBe('hr')
    expect(payslipOwner('hr_reviewed')).toBe('finance')
    expect(payslipOwner('locked')).toBe('finance')
  })
})
