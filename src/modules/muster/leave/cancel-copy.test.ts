import { describe, expect, it } from 'vitest'
import { cancelAudience, cancelAuditSummary } from './cancel-copy'

describe('withdrawing and cancelling leave (R1 2.1)', () => {
  it('tells the approvers when the applicant withdraws a pending request', () => {
    expect(cancelAudience({ own: true, wasApproved: false })).toBe('approvers')
  })
  it('tells the employee when HR cancels their leave', () => {
    expect(cancelAudience({ own: false, wasApproved: true })).toBe('employee')
    expect(cancelAudience({ own: false, wasApproved: false })).toBe('employee')
  })
  it('words the audit row by who did it', () => {
    expect(cancelAuditSummary({ own: true, wasApproved: false }, 'Casual leave', '3 Oct 2026', 'Asha')).toBe('Leave withdrawn by the applicant: Casual leave, 3 Oct 2026')
    expect(cancelAuditSummary({ own: false, wasApproved: true }, 'Casual leave', '3 Oct 2026', 'Ravi')).toBe('Approved leave cancelled by Ravi: Casual leave, 3 Oct 2026')
  })
})
