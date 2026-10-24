import { describe, expect, it } from 'vitest'
import { linkedClaimantProblem } from './rules'

const onPayroll = (s: string) => s === 'active'
const everyone = { eligibility: 'all', eligibleEmployeeIds: [] as unknown[] }

describe('signed-in employees on the claim form (R1 2.3)', () => {
  it('lets a linked, on-payroll employee in without an email code', () => {
    expect(linkedClaimantProblem({ _id: 'e1', status: 'active', deletedAt: null }, everyone, onPayroll)).toBeNull()
  })
  it('refuses an unlinked, deleted, off-payroll or unlisted employee', () => {
    expect(linkedClaimantProblem(null, everyone, onPayroll)).toMatch(/not linked/)
    expect(linkedClaimantProblem({ _id: 'e1', status: 'active', deletedAt: new Date() }, everyone, onPayroll)).toMatch(/not linked/)
    expect(linkedClaimantProblem({ _id: 'e1', status: 'exited' }, everyone, onPayroll)).toMatch(/cannot claim/)
    expect(linkedClaimantProblem({ _id: 'e1', status: 'active' }, { eligibility: 'selected', eligibleEmployeeIds: ['e2'] }, onPayroll)).toMatch(/cannot claim/)
  })
})
