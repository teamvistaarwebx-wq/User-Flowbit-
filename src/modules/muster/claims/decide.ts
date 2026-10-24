import 'server-only'
import { revalidatePath } from 'next/cache'
import { fail, ok, type ActionOptions, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { emailLayout, sendMail } from '@/lib/mail'
import { notifyMembers } from '@/lib/notify'
import { Claim } from '@/models/muster/Claim'
import { Employee } from '@/models/muster/Employee'
import { OWN_RECORD_REFUSAL } from '@/modules/muster/leave/approvals'
import { assertVisible, mayDecideOwn, ownEmployeeId } from '@/modules/muster/people/scope'
import { UNDECIDED, type ClaimStatus } from './constants'
import { claimantLines, decisionHeadline, decisionMessage, decisionRefusal, type Decision } from './rules'

/** Deciding a claim: the review screen and approval links (email, WhatsApp) run this behind the same checks. */

export const CLAIM_DECIDE_OPTS: ActionOptions = { product: 'muster', perm: 'claims.review' }

export const refreshClaims = () => {
  revalidatePath('/app/hr/claims')
  revalidatePath('/app/me/claims')
}

export async function tellClaimant(ctx: Ctx, claim: { _id: unknown; employeeId: unknown; purpose: string; amountClaimed: number }, decision: Decision, approved: number, note?: string) {
  const employee = await ctx.db(Employee).findById(claim.employeeId, { workEmail: 1, fullName: 1, memberId: 1 }).lean()
  if (!employee) return
  const headline = decisionHeadline(decision)
  const lines = claimantLines(claim, decision, approved, note)
  const mail = emailLayout({ title: headline, paragraphs: lines, cta: { label: 'Open My claims', href: '/app/me/claims' } })
  await sendMail({ to: employee.workEmail, subject: headline, ...mail, orgId: ctx.orgId, kind: 'other', entity: 'Claim', entityId: claim._id })
  if (employee.memberId) await notifyMembers(ctx, [employee.memberId], { title: headline, body: lines[0], href: '/app/me/claims', kind: decision === 'rejected' ? 'warning' : 'success', product: 'muster', event: 'claim.decided' })
}

export async function decideClaim(ctx: Ctx, id: string, decision: Decision, approved: number | null, note?: string): Promise<ActionResult> {
  const claim = await ctx.db(Claim).findById(id).lean()
  if (!claim) throw new NotFoundError('That claim')
  await assertVisible(ctx, String(claim.employeeId))
  if (String(claim.employeeId) === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
  const refusal = decisionRefusal(claim.status as ClaimStatus)
  if (refusal) return fail(refusal)
  const amount = decision === 'rejected' ? null : (approved ?? claim.amountClaimed)
  const status: ClaimStatus = decision === 'rejected' ? 'rejected' : amount === claim.amountClaimed ? 'approved' : 'partially_approved'
  const done = await ctx.db(Claim).updateOne(
    { _id: id, status: { $in: [...UNDECIDED] } },
    { $set: { status, amountApproved: amount, reviewNote: note, reviewedBy: ctx.userId, reviewedByName: ctx.user.name, reviewedAt: new Date() } },
  )
  if (!done.modifiedCount) return fail('That claim has already been decided. The page has been refreshed to show its decision.')
  const employee = await ctx.db(Employee).findById(claim.employeeId, { fullName: 1 }).lean()
  const name = employee?.fullName ?? 'the employee'
  const finalDecision: Decision = status === 'rejected' ? 'rejected' : status === 'approved' ? 'approved' : 'partially_approved'
  await audit(ctx, { action: `claim.${finalDecision}`, entity: 'Claim', entityId: id, summary: decisionMessage(finalDecision, name, claim.amountClaimed, amount ?? 0), product: 'muster', meta: { note } })
  await tellClaimant(ctx, claim, finalDecision, amount ?? 0, note)
  refreshClaims()
  return ok(decisionMessage(finalDecision, name, claim.amountClaimed, amount ?? 0))
}
