import { describe, expect, it } from 'vitest'
import { accruedDays, accruesLeave, carryForward, completedServiceYears, earnedMonths, firstEarnedMonth, leaveYearFor, openingBalance, type LeaveTypeRule } from './accrual'
import { applyDecision, canActOn, currentStage, decisionRefusal, isDecidableBy, stagesFor, type Actor } from './approvals'
import { computeLeaveDays, leaveDates, leaveRangeProblem, splitAgainstBalance, unpaidDatesOf } from './days'

const cal = { workWeek: [1, 2, 3, 4, 5, 6], holidays: ['2026-10-02'] }

describe('leave days', () => {
  it('skips Sundays and holidays', () => {
    // Thu 1 Oct – Mon 5 Oct: 2 Oct holiday, 4 Oct Sunday
    expect(leaveDates('2026-10-01', '2026-10-05', cal)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05'])
    expect(computeLeaveDays('2026-10-01', '2026-10-05', false, cal)).toBe(3)
  })

  it('counts a half day as 0.5 and an all-off range as 0', () => {
    expect(computeLeaveDays('2026-10-05', '2026-10-05', true, cal)).toBe(0.5)
    expect(computeLeaveDays('2026-10-04', '2026-10-04', false, cal)).toBe(0)
  })

  it('splits against the balance', () => {
    expect(splitAgainstBalance(5, 3)).toEqual({ paid: 3, unpaid: 2 })
    expect(splitAgainstBalance(2, 7.5)).toEqual({ paid: 2, unpaid: 0 })
    expect(splitAgainstBalance(2, -1)).toEqual({ paid: 0, unpaid: 2 })
    // A fractional balance pays whole dates only, so no date is both paid and loss of pay.
    expect(splitAgainstBalance(4, 2.5)).toEqual({ paid: 2, unpaid: 2 })
    expect(splitAgainstBalance(0.5, 2.5)).toEqual({ paid: 0.5, unpaid: 0 })
    expect(splitAgainstBalance(1.5, 1)).toEqual({ paid: 1, unpaid: 0.5 })
  })

  it('makes the last dates the unpaid ones', () => {
    expect(unpaidDatesOf(['a', 'b', 'c'], 1, false)).toEqual(['b', 'c'])
    expect(unpaidDatesOf(['a'], 0, true)).toEqual(['a'])
    expect(unpaidDatesOf(['a'], 0.5, true)).toEqual([])
  })

  it('checks the range', () => {
    expect(leaveRangeProblem({ start: '2026-10-05', end: '2026-10-04', isHalfDay: false, today: '2026-10-01' })?.field).toBe('endDate')
    expect(leaveRangeProblem({ start: '2026-10-05', end: '2026-10-06', isHalfDay: true, today: '2026-10-01' })?.field).toBe('isHalfDay')
    expect(leaveRangeProblem({ start: '2026-08-30', end: '2026-08-31', isHalfDay: false, joinDate: '2026-09-01', today: '2026-10-01' })?.message).toContain('1 Sep 2026')
    expect(leaveRangeProblem({ start: '2026-10-05', end: '2026-10-06', isHalfDay: false, today: '2026-10-01' })).toBeNull()
  })
})

describe('accrual', () => {
  const pl: LeaveTypeRule = { accrualModel: 'monthly', annualQuota: 12, accrualPerMonth: 1, carryForwardCap: 30 }
  const year = leaveYearFor('2026-10-01', 4)
  const person = { employmentType: 'full_time', status: 'confirmed', joinDate: '2024-06-10' }

  it('finds an April–March leave year', () => {
    expect(year).toEqual({ start: '2026-04-01', end: '2027-03-31', label: '2026-27' })
    expect(leaveYearFor('2026-02-10', 4).label).toBe('2025-26')
    expect(leaveYearFor('2026-02-10', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31', label: '2026' })
  })

  it('credits a month once its 1st has arrived', () => {
    expect(accruedDays(pl, person, year, '2026-10-01')).toBe(7) // Apr–Oct
    expect(accruedDays(pl, person, year, '2026-09-30')).toBe(6)
  })

  it('counts the join month only when joined by the 15th', () => {
    expect(firstEarnedMonth('2026-07-15')).toBe('2026-07-01')
    expect(firstEarnedMonth('2026-07-16')).toBe('2026-08-01')
    expect(earnedMonths(year, '2026-07-16', '2026-10-01')).toBe(3)
  })

  it('stops after the exit date', () => {
    expect(earnedMonths(year, '2024-01-01', '2026-12-01', '2026-08-20')).toBe(5)
  })

  it('does not accrue for probation, interns or contract staff', () => {
    expect(accruesLeave({ employmentType: 'full_time', status: 'probation' })).toBe(false)
    expect(accruesLeave({ employmentType: 'intern', status: 'intern' })).toBe(false)
    expect(accruedDays(pl, { ...person, status: 'probation' }, year, '2026-10-01')).toBe(0)
  })

  it('grants annual quota up front pro rata, to the half day', () => {
    const annual: LeaveTypeRule = { accrualModel: 'annual', annualQuota: 12, accrualPerMonth: 0, carryForwardCap: null }
    expect(accruedDays(annual, person, year, '2026-10-01')).toBe(12)
    expect(accruedDays(annual, { ...person, joinDate: '2026-07-20' }, year, '2026-10-01')).toBe(8)
  })

  it('counts completed service years', () => {
    expect(completedServiceYears('2024-06-10', '2026-06-09')).toBe(1)
    expect(completedServiceYears('2024-06-10', '2026-06-10')).toBe(2)
  })

  it('carries forward a share of the balance, capped', () => {
    expect(carryForward(9, 50, 30)).toBe(4.5)
    expect(carryForward(-2, 50, 30)).toBe(0)
    expect(carryForward(80, 100, 30)).toBe(30)
    expect(carryForward(10, 50, 0)).toBe(0)
    expect(openingBalance([{ accrued: 12, taken: 4 }, { accrued: 12, taken: 10 }], 50, 30)).toBe(3)
    // An opening-balance adjustment in an earlier year carries into the next one.
    expect(openingBalance([{ accrued: 0, taken: 0, adjusted: 8 }], 100, null)).toBe(8)
    expect(openingBalance([{ accrued: 12, taken: 4, adjusted: -2 }], 50, null)).toBe(3)
  })
})

describe('approval routing', () => {
  const hr: Actor = { employeeId: 'hr1', canSignHr: true, canEscalated: false, canDecideOwn: false }
  const manager: Actor = { employeeId: 'm1', canSignHr: false, canEscalated: false, canDecideOwn: false }
  const request = { employeeId: 'e1', managerId: 'm1', stages: ['manager', 'hr'], completedStages: [] as string[], status: 'pending' }

  it('routes through the manager when they have a login', () => {
    expect(stagesFor({ employeeId: 'e1', managerId: 'm1', managerCanSign: true, applicantCanSignHr: false })).toEqual(['manager', 'hr'])
    expect(stagesFor({ employeeId: 'e1', managerId: 'm1', managerCanSign: false, applicantCanSignHr: false })).toEqual(['hr'])
    expect(stagesFor({ employeeId: 'hr1', applicantCanSignHr: true, managerCanSign: false })).toEqual(['management'])
  })

  it('lets only the exact manager sign the manager stage', () => {
    expect(isDecidableBy(manager, request)).toBe(true)
    expect(isDecidableBy(hr, request)).toBe(false)
    expect(canActOn({ ...manager, employeeId: 'm2' }, request, 'manager')).toBe(false)
  })

  it('advances to HR after the manager approves, then finishes', () => {
    const afterManager = applyDecision(request, 'approved')
    expect(afterManager).toMatchObject({ status: 'pending', completedStages: ['manager'], final: false })
    expect(currentStage(request.stages, afterManager.completedStages)).toBe('hr')
    const done = applyDecision({ ...request, completedStages: afterManager.completedStages }, 'approved')
    expect(done).toMatchObject({ status: 'approved', final: true })
  })

  it('hands a lapsed manager stage to HR, who signs it once', () => {
    const lapsed = { ...request, managerLapsed: true }
    expect(isDecidableBy(hr, lapsed)).toBe(true)
    expect(isDecidableBy(manager, lapsed)).toBe(false)
    expect(applyDecision(lapsed, 'approved')).toMatchObject({ status: 'approved', completedStages: ['manager', 'hr'], final: true })
    expect(applyDecision({ ...lapsed, stages: ['manager', 'management'] }, 'approved')).toMatchObject({ status: 'pending', completedStages: ['manager'] })
  })

  it('settles on a rejection at any stage', () => {
    expect(applyDecision(request, 'rejected')).toMatchObject({ status: 'rejected', final: true })
  })

  it('refuses deciding your own request', () => {
    expect(decisionRefusal({ ...hr, employeeId: 'e1' }, { ...request, stages: ['hr'] })).toContain('own record')
  })

  it('lets management step in at any stage', () => {
    expect(isDecidableBy({ employeeId: null, canSignHr: false, canEscalated: true, canDecideOwn: true }, request)).toBe(true)
  })
})
