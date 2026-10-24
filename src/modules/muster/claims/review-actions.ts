'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { NotFoundError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { listOf, objectId, optionalText, paise } from '@/lib/validation'
import { Claim } from '@/models/muster/Claim'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds } from '@/modules/muster/people/scope'
import { cycleLabel } from '@/modules/muster/payroll/queries'
import { isLocked } from '@/modules/muster/payroll/stages'
import { APPROVED, UNDECIDED, type ClaimStatus } from './constants'
import { CLAIM_DECIDE_OPTS, decideClaim, refreshClaims, tellClaimant } from './decide'
import { returnStrandedClaims } from './unschedule'
import { approvedAmountProblem } from './rules'

const OPTS = CLAIM_DECIDE_OPTS
const refresh = refreshClaims

export const approveClaim = action(z.object({ id: objectId }), async ({ id }, ctx) => decideClaim(ctx, id, 'approved', null), OPTS)

export const adjustClaim = action(
  z.object({ id: objectId, amount: z.union([z.string(), z.number()]).refine((v) => !/\.\d{3,}\s*$/.test(String(v)), 'Use at most two decimals (paise)').pipe(paise), note: optionalText(500) }),
  async ({ id, amount, note }, ctx) => {
    const claim = await ctx.db(Claim).findById(id, { amountClaimed: 1 }).lean()
    if (!claim) throw new NotFoundError('That claim')
    const problem = approvedAmountProblem(amount, claim.amountClaimed, note)
    if (problem) return fail(problem, { [problem.startsWith('Explain') ? 'note' : 'amount']: problem })
    return decideClaim(ctx, id, 'partially_approved', amount, note)
  },
  OPTS,
)

export const rejectClaim = action(
  z.object({ id: objectId, note: z.string().trim().min(3, 'Tell them why, in a sentence').max(500) }),
  async ({ id, note }, ctx) => decideClaim(ctx, id, 'rejected', null, note),
  OPTS,
)

export const bulkApproveClaims = action(
  z.object({ ids: listOf(objectId) }),
  async ({ ids }, ctx) => {
    if (!ids.length) return fail('Tick the claims to approve first.')
    const visible = await visibleEmployeeIds(ctx)
    const claims = (await ctx.db(Claim).find({ _id: { $in: ids } }).lean()).filter((c) => visible === null || visible.includes(String(c.employeeId)))
    const own = ownEmployeeId(ctx)
    if (own && !mayDecideOwn(ctx) && claims.some((c) => String(c.employeeId) === own)) return fail('Your own claim is in that selection, so someone else has to decide it. Untick it and try again.')
    let approved = 0
    let total = 0
    for (const claim of claims.filter((c) => UNDECIDED.includes(c.status as ClaimStatus))) {
      const done = await ctx.db(Claim).updateOne({ _id: claim._id, status: { $in: [...UNDECIDED] } }, { $set: { status: 'approved', amountApproved: claim.amountClaimed, reviewedBy: ctx.userId, reviewedByName: ctx.user.name, reviewedAt: new Date() } })
      if (!done.modifiedCount) continue
      approved += 1
      total += claim.amountClaimed
      await tellClaimant(ctx, claim, 'approved', claim.amountClaimed)
    }
    const skipped = ids.length - approved
    await audit(ctx, { action: 'claim.bulk_approved', entity: 'Claim', summary: `Approved ${approved} claims in one go (${formatINR(total)})`, product: 'muster' })
    refresh()
    return ok(`${approved} claim${approved === 1 ? '' : 's'} approved, ${formatINR(total)} in all.${skipped ? ` ${skipped} skipped because they were already decided.` : ''}`)
  },
  OPTS,
)

export const scheduleClaims = action(
  z.object({ cycleId: objectId, ids: listOf(objectId) }),
  async ({ cycleId, ids }, ctx) => {
    if (!ids.length) return fail('Tick the claims to send to payroll first.')
    const cycle = await ctx.db(PayrollCycle).findById(cycleId).lean()
    if (!cycle) throw new NotFoundError('That payroll month')
    if (isLocked(cycle.status)) return fail(`${cycleLabel(cycle)} payroll is locked. Pick a month that is still open.`)
    const own = ownEmployeeId(ctx)
    await returnStrandedClaims(ctx, ids)
    const filter = { _id: { $in: ids }, status: { $in: [...APPROVED] }, payrollCycleId: null, ...(own && !mayDecideOwn(ctx) ? { employeeId: { $ne: own } } : {}) }
    const candidates = await ctx.db(Claim).find(filter, { _id: 1 }).lean()
    // The status guard is repeated in the write, so a claim paid outside payroll meanwhile is not pulled back.
    await ctx.db(Claim).updateMany({ ...filter, _id: { $in: candidates.map((c) => c._id) } }, { $set: { status: 'scheduled_for_payroll', payrollCycleId: cycle._id } })
    const claims = await ctx.db(Claim).find({ _id: { $in: candidates.map((c) => c._id) }, status: 'scheduled_for_payroll', payrollCycleId: cycle._id }, { amountApproved: 1, amountClaimed: 1 }).lean()
    if (!claims.length) return fail('None of those claims can be sent to payroll: only approved claims that are not already in a payroll month can.')
    const total = claims.reduce((s, c) => s + (c.amountApproved ?? c.amountClaimed), 0)
    const label = cycleLabel(cycle)
    await audit(ctx, { action: 'claim.scheduled', entity: 'PayrollCycle', entityId: cycle._id, summary: `Scheduled ${claims.length} claims (${formatINR(total)}) into ${label} payroll`, product: 'muster' })
    refresh()
    revalidatePath(`/app/hr/payroll/${cycle._id}`)
    const regen = ['generated', 'hr_reviewed', 'finance_approved'].includes(cycle.status) ? ' Regenerate that month so they reach net pay.' : ''
    return ok(`${claims.length} claim${claims.length === 1 ? '' : 's'} scheduled into ${label} payroll, ${formatINR(total)} in all. They are paid when that month is released.${regen}`)
  },
  { product: 'muster', perm: 'claims.review', feature: 'muster.payroll' },
)

/** Claims paid outside payroll (a form that does not feed payroll, or an urgent refund): record the payment. */
export const markClaimsPaid = action(
  z.object({ ids: listOf(objectId), paymentReference: z.string().trim().min(2, 'Enter the bank or UPI reference').max(60) }),
  async ({ ids, paymentReference }, ctx) => {
    if (!ids.length) return fail('Tick the claims that were paid first.')
    const own = ownEmployeeId(ctx)
    await returnStrandedClaims(ctx, ids)
    const filter = { _id: { $in: ids }, status: { $in: [...APPROVED] }, payrollCycleId: null, ...(own && !mayDecideOwn(ctx) ? { employeeId: { $ne: own } } : {}) }
    const claims = await ctx.db(Claim).find(filter, { amountApproved: 1, amountClaimed: 1 }).lean()
    if (!claims.length) return fail('None of those claims can be marked paid: only approved claims that are not in a payroll month can.')
    await ctx.db(Claim).updateMany({ ...filter, _id: { $in: claims.map((c) => c._id) } }, { $set: { status: 'paid', paidAt: new Date(), paymentReference } })
    const total = claims.reduce((s, c) => s + (c.amountApproved ?? c.amountClaimed), 0)
    await audit(ctx, { action: 'claim.paid', entity: 'Claim', summary: `Marked ${claims.length} claims paid outside payroll (${formatINR(total)}), reference ${paymentReference}`, product: 'muster' })
    refresh()
    return ok(`${claims.length} claim${claims.length === 1 ? '' : 's'} marked paid, ${formatINR(total)} in all, reference ${paymentReference}.`)
  },
  { product: 'muster', perm: 'claims.pay' },
)
