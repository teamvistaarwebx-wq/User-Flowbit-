import 'server-only'
import { revalidatePath } from 'next/cache'
import { fail, ok, type ActionOptions, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { OWN_RECORD_REFUSAL } from '@/modules/muster/leave/approvals'
import { assertVisible, mayDecideOwn, ownEmployeeId } from '@/modules/muster/people/scope'

/** Verifying a self-service bank change: the payroll screen and approval links (email, WhatsApp) run this behind the same checks. */

export const BANK_VERIFY_OPTS: ActionOptions = { product: 'muster', perm: 'people.read_sensitive' }

export async function verifyBankChangeCore(ctx: Ctx, id: string): Promise<ActionResult> {
  const change = await ctx.db(BankChangeRequest).findById(id).lean()
  if (!change) throw new NotFoundError('That bank change')
  await assertVisible(ctx, String(change.employeeId))
  if (String(change.employeeId) === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
  const done = await ctx.db(BankChangeRequest).updateOne({ _id: id, verifiedAt: null }, { $set: { verifiedAt: new Date(), verifiedBy: ctx.userId, verifiedByName: ctx.user.name } })
  if (!done.modifiedCount) return fail('That bank change was already verified.')
  await audit(ctx, { action: 'employee.bank_verified', entity: 'Employee', entityId: change.employeeId, summary: `Bank account verified for ${change.employeeName}, account ${change.newMasked}`, product: 'muster' })
  revalidatePath('/app/hr/payroll', 'layout')
  revalidatePath(`/app/hr/people/${change.employeeId}`)
  return ok(`Bank change verified for ${change.employeeName}, account ${change.newMasked}.`)
}
