import { addDays, formatDate, istInstant } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { APPROVED, MAX_CLAIM_PAISE, UNDECIDED, type ClaimStatus } from './constants'

/** Pure claim rules: windows, amounts, decisions and messages. Money in paise. */

export type FormWindow = { status: string; opensAt: Date | string; closesAt: Date | string }
export type FormState = 'draft' | 'closed' | 'upcoming' | 'open' | 'ended'

/** The IST calendar day of an instant. */
export const companyDay = (at: Date | string): string => new Date(new Date(at).getTime() + 330 * 60_000).toISOString().slice(0, 10)

/** IST 00:00 of the first day and IST 23:59:59 of the deadline day. */
export const windowFromDays = (opensOn: string, closesOn: string): { opensAt: Date; closesAt: Date } => ({
  opensAt: istInstant(opensOn, '00:00'),
  closesAt: new Date(istInstant(addDays(closesOn, 1), '00:00').getTime() - 1000),
})

export function claimFormState(form: FormWindow, now: Date = new Date()): FormState {
  if (form.status === 'draft') return 'draft'
  if (form.status === 'closed') return 'closed'
  if (now < new Date(form.opensAt)) return 'upcoming'
  if (now > new Date(form.closesAt)) return 'ended'
  return 'open'
}

export const FORM_STATE_LABEL: Record<FormState, string> = { draft: 'Draft', closed: 'Closed', upcoming: 'Upcoming', open: 'Open', ended: 'Ended' }
export const FORM_STATE_TONE: Record<FormState, 'neutral' | 'info' | 'success' | 'warning'> = { draft: 'neutral', closed: 'neutral', upcoming: 'info', open: 'success', ended: 'warning' }

/** "4 Oct 2026 – 10 Oct 2026" in IST days. */
export const formWindowLabel = (form: FormWindow): string => `${formatDate(companyDay(form.opensAt))} – ${formatDate(companyDay(form.closesAt))}`

/** Why a claim cannot be filed on this form right now, or null. */
export function claimWindowProblem(form: FormWindow, now: Date = new Date()): string | null {
  const state = claimFormState(form, now)
  if (state === 'open') return null
  if (state === 'upcoming' || state === 'draft') return `This form takes claims from ${formWindowLabel(form)}. Come back then.`
  return 'This form is no longer accepting claims. Speak to HR if you still need to file an expense.'
}

/** Amount checks at submit: positive, the global maximum, the form cap and the category ceiling. */
export function claimAmountProblem(amount: number, caps: { formCap?: number | null; categoryCap?: number | null; categoryName?: string }): string | null {
  if (!Number.isFinite(amount) || amount < 1) return 'Enter an amount of at least ₹0.01.'
  if (amount > MAX_CLAIM_PAISE) return `A single claim can be at most ${formatINR(MAX_CLAIM_PAISE)}. Split it into separate expenses.`
  if (caps.formCap != null && amount > caps.formCap) return `Claims on this form are capped at ${formatINR(caps.formCap)}.`
  if (caps.categoryCap != null && amount > caps.categoryCap) return `${caps.categoryName ?? 'This category'} claims are capped at ${formatINR(caps.categoryCap)}.`
  return null
}

export function expenseDateProblem(date: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return 'Pick the day you spent the money.'
  if (date > today) return 'That day has not come yet. Claim an expense once it has been paid.'
  if (date < '2000-01-01') return 'Pick a real date.'
  return null
}

/** An adjusted (partial) approval: more than zero, no more than claimed, with a note. */
export function approvedAmountProblem(approved: number, claimed: number, note: string | undefined): string | null {
  if (!Number.isFinite(approved) || approved < 1) return 'Approve at least ₹0.01, or reject the claim instead.'
  if (approved > claimed) return `You can approve at most the ${formatINR(claimed)} claimed.`
  if (approved < claimed && !note?.trim()) return 'Explain why the claim was reduced.'
  return null
}

/** Why a reviewer may not change this claim's decision, or null. */
export function decisionRefusal(status: ClaimStatus): string | null {
  if (UNDECIDED.includes(status)) return null
  if (status === 'scheduled_for_payroll' || status === 'paid') return 'That claim is already in a payroll month, so its decision can no longer change.'
  return 'That claim has already been decided. The page has been refreshed to show its decision.'
}

export const isApproved = (status: ClaimStatus): boolean => APPROVED.includes(status)

export type Decision = 'approved' | 'partially_approved' | 'rejected'

export function decisionMessage(decision: Decision, name: string, claimed: number, approved: number): string {
  if (decision === 'approved') return `Claim approved for ${name}, ${formatINR(claimed)}. It is ready to send to payroll.`
  if (decision === 'partially_approved') return `${formatINR(approved)} of ${formatINR(claimed)} approved for ${name}. It is ready to send to payroll.`
  return `Claim of ${formatINR(claimed)} rejected for ${name}. They are emailed the reason.`
}

export const decisionHeadline = (decision: Decision): string =>
  decision === 'approved' ? 'Your claim was approved' : decision === 'partially_approved' ? 'Your claim was partly approved' : 'Your claim was not approved'

/**
 * The claimant's email paragraphs, as plain text: emailLayout escapes each one, so the
 * reviewer's note is not escaped here (R3 L-23e: it showed '&' as '&amp;amp;').
 */
export function claimantLines(claim: { purpose: string; amountClaimed: number }, decision: Decision, approved: number, note?: string): string[] {
  return [
    `${claim.purpose}: ${formatINR(claim.amountClaimed)} claimed${decision === 'rejected' ? '.' : `, ${formatINR(approved)} approved.`}`,
    ...(note ? [`Note from the reviewer: ${note}`] : []),
    decision === 'rejected' ? 'Speak to HR if you think this is wrong.' : 'It will be paid with salary once it is scheduled into a payroll month.',
  ]
}

/** Escapes text placed into an email's HTML. */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Who may use a form: everyone on payroll, or the chosen people. */
export const isEligibleFor = (form: { eligibility: string; eligibleEmployeeIds: readonly unknown[] }, employeeId: string): boolean =>
  form.eligibility !== 'selected' || form.eligibleEmployeeIds.some((id) => String(id) === employeeId)

/** Form slug: lowercase words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Creation message: who can use the form and when. */
export function formCreatedMessage(name: string, eligibleCount: number | null, opensOn: string, closesOn: string, today: string): string {
  const who = eligibleCount === null ? 'everyone' : `${eligibleCount} ${eligibleCount === 1 ? 'person' : 'people'}`
  if (opensOn > today) return `Claim form "${name}" created for ${who}. It opens on ${formatDate(opensOn)} and takes claims until ${formatDate(closesOn)}. Share its link below: before it opens, the link shows that date.`
  return `Claim form "${name}" created, open to ${who} until ${formatDate(closesOn)}. Share its link below.`
}

/**
 * A signed-in Flowbit member linked to an employee may file on the form without the email code (R1 2.3):
 * the record must exist, not be deleted, be on payroll and be on the form's list.
 */
export function linkedClaimantProblem(
  employee: { _id: unknown; deletedAt?: Date | null; status: string } | null | undefined,
  form: { eligibility: string; eligibleEmployeeIds: readonly unknown[] },
  onPayroll: (status: string) => boolean,
): string | null {
  if (!employee || employee.deletedAt) return 'Your login is not linked to an employee record. Verify with your work email instead.'
  if (!onPayroll(employee.status) || !isEligibleFor(form, String(employee._id))) return 'You cannot claim on this form. Speak to HR.'
  return null
}
