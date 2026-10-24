/** Pure: who hears about a withdrawn or cancelled leave request, and how the audit row reads. */

export type CancelCase = Readonly<{ own: boolean; wasApproved: boolean }>

/** The applicant withdraws: the approvers on the current stage hear. HR cancels someone's leave: the employee hears. */
export const cancelAudience = (c: CancelCase): 'approvers' | 'employee' | 'none' => (c.own ? (c.wasApproved ? 'none' : 'approvers') : 'employee')

export function cancelAuditSummary(c: CancelCase, leaveName: string, dateLabel: string, by: string): string {
  if (c.own) return `Leave withdrawn by the applicant: ${leaveName}, ${dateLabel}`
  return `${c.wasApproved ? 'Approved leave cancelled' : 'Leave request cancelled'} by ${by}: ${leaveName}, ${dateLabel}`
}
