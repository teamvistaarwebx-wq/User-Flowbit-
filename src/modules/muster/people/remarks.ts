/**
 * Remark types and who sees them (pure). General notes and one-on-ones are
 * shared with the employee in self-service (a one-on-one also notifies them);
 * concerns and performance notes stay with HR.
 */

export const REMARK_FORM_KINDS = ['performance', 'concern', 'one_on_one', 'general'] as const
export type RemarkKind = (typeof REMARK_FORM_KINDS)[number]

const SHARED = new Set<string>(['general', 'one_on_one'])

export const isSharedWithEmployee = (kind: string): boolean => SHARED.has(kind)
export const notifiesEmployee = (kind: string): boolean => kind === 'one_on_one'

/** "Visible to Aditi" or "HR only", for the form and the list. */
export const remarkVisibility = (kind: string, firstName: string): string => (isSharedWithEmployee(kind) ? `Visible to ${firstName}` : 'HR only')
