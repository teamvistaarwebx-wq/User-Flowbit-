'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { NotFoundError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { objectId, paise, requiredText } from '@/lib/validation'
import { Employee } from '@/models/muster/Employee'
import { PayrollAdjustment } from '@/models/muster/PayrollAdjustment'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { mayDecideOwn, ownEmployeeId } from '@/modules/muster/people/scope'
import { OWN_RECORD_REFUSAL } from '@/modules/muster/leave/approvals'
import { BANK_VERIFY_OPTS, verifyBankChangeCore } from './bank-verify'
import { recomputeTotals } from './generate'
import { cycleLabel, getCycle } from './queries'
import { isLocked } from './stages'

const OPTS = { product: 'muster', feature: 'muster.payroll', perm: 'payroll.run' } as const
const MAX_ADJUSTMENT_PAISE = 10_00_000_00

async function unlockedCycle(ctx: Parameters<typeof getCycle>[0], id: string) {
  const cycle = await getCycle(ctx, id)
  if (!cycle) throw new NotFoundError('That payroll month')
  if (isLocked(cycle.status)) return { cycle, refusal: `${cycleLabel(cycle)} payroll is locked. Reopen it before changing anyone's pay.` }
  return { cycle, refusal: null }
}

async function employeeName(ctx: Parameters<typeof getCycle>[0], employeeId: string) {
  const e = await ctx.db(Employee).findById(employeeId, { fullName: 1 }).lean()
  if (!e) throw new NotFoundError('That employee')
  return e.fullName
}

export const setPayrollHold = action(
  z.object({ id: objectId, employeeId: objectId, kind: z.enum(['hold', 'exclude']), reason: requiredText('Reason', 300) }),
  async ({ id, employeeId, kind, reason }, ctx) => {
    const { cycle, refusal } = await unlockedCycle(ctx, id)
    if (refusal) return fail(refusal)
    if (employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const name = await employeeName(ctx, employeeId)
    const holds = [...(cycle.holds ?? []).filter((h) => String(h.employeeId) !== employeeId), { employeeId, kind, reason, createdBy: ctx.userId, createdByName: ctx.user.name, createdAt: new Date() }]
    await ctx.db(PayrollCycle).updateOne({ _id: cycle._id }, { $set: { holds } })
    if (kind === 'hold') await ctx.db(PayrollEntry).updateOne({ cycleId: cycle._id, employeeId }, { $set: { status: 'on_hold', notes: `On hold: ${reason}` } })
    if (kind === 'exclude') await ctx.db(PayrollEntry).updateOne({ cycleId: cycle._id, employeeId }, { $set: { status: 'excluded', notes: `Excluded: ${reason}` } })
    await recomputeTotals(ctx, cycle._id)
    await audit(ctx, { action: `payroll.${kind}`, entity: 'PayrollCycle', entityId: cycle._id, summary: `${kind === 'hold' ? 'Held' : 'Excluded'} ${name}'s ${cycleLabel(cycle)} pay`, product: 'muster', meta: { employeeId, reason } })
    revalidatePath(`/app/hr/payroll/${id}`)
    return ok(kind === 'hold' ? `${name}'s ${cycleLabel(cycle)} pay is on hold. It stays out of the release and payslips until you release the hold.` : `${name} is excluded from ${cycleLabel(cycle)} payroll. Regenerate to drop them from the register.`)
  },
  OPTS,
)

export const releasePayrollHold = action(
  z.object({ id: objectId, employeeId: objectId }),
  async ({ id, employeeId }, ctx) => {
    const { cycle, refusal } = await unlockedCycle(ctx, id)
    if (refusal) return fail(refusal)
    if (employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const name = await employeeName(ctx, employeeId)
    const holds = (cycle.holds ?? []).filter((h) => String(h.employeeId) !== employeeId)
    await ctx.db(PayrollCycle).updateOne({ _id: cycle._id }, { $set: { holds } })
    const entry = await ctx.db(PayrollEntry).updateOne({ cycleId: cycle._id, employeeId }, { $set: { status: 'ready' }, $unset: { notes: 1 } })
    await recomputeTotals(ctx, cycle._id)
    await audit(ctx, { action: 'payroll.hold_released', entity: 'PayrollCycle', entityId: cycle._id, summary: `Released the hold on ${name}'s ${cycleLabel(cycle)} pay`, product: 'muster', meta: { employeeId } })
    revalidatePath(`/app/hr/payroll/${id}`)
    return ok(entry.matchedCount ? `${name} is back in ${cycleLabel(cycle)} payroll.` : `${name} is no longer excluded from ${cycleLabel(cycle)} payroll. Regenerate the month to add them back to the register.`)
  },
  OPTS,
)

export const addPayrollAdjustment = action(
  z.object({ id: objectId, employeeId: objectId, lineType: z.enum(['earning', 'deduction']), label: requiredText('Label', 60), amount: paise, reason: requiredText('Reason', 300) }),
  async ({ id, employeeId, lineType, label, amount, reason }, ctx) => {
    if (amount < 1) return fail('Some fields need attention.', { amount: 'Enter at least ₹0.01' })
    if (amount > MAX_ADJUSTMENT_PAISE) return fail('Some fields need attention.', { amount: `At most ${formatINR(MAX_ADJUSTMENT_PAISE)} in one adjustment` })
    const { cycle, refusal } = await unlockedCycle(ctx, id)
    if (refusal) return fail(refusal)
    if (employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const name = await employeeName(ctx, employeeId)
    const adj = await ctx.db(PayrollAdjustment).create({ cycleId: cycle._id, employeeId, year: cycle.year, month: cycle.month, lineType, label, amount, reason, createdBy: ctx.userId, createdByName: ctx.user.name })
    await audit(ctx, { action: 'payroll.adjustment_added', entity: 'Employee', entityId: employeeId, summary: `Payroll adjustment added: ${label} (${formatINR(amount)} ${lineType}) for ${name}, ${cycleLabel(cycle)}`, product: 'muster', meta: { adjustmentId: String(adj._id), reason } })
    revalidatePath(`/app/hr/payroll/${id}`)
    return ok(`${label} (${formatINR(amount)} ${lineType}) added for ${name}, ${cycleLabel(cycle)}. Regenerate payroll to apply it.`)
  },
  OPTS,
)

export const voidPayrollAdjustment = action(
  z.object({ id: objectId, adjustmentId: objectId, reason: requiredText('Reason', 300) }),
  async ({ id, adjustmentId, reason }, ctx) => {
    const { cycle, refusal } = await unlockedCycle(ctx, id)
    if (refusal) return fail(refusal)
    const current = await ctx.db(PayrollAdjustment).findOne({ _id: adjustmentId, cycleId: cycle._id }, { employeeId: 1 }).lean()
    if (current && String(current.employeeId) === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const adj = await ctx.db(PayrollAdjustment).findOneAndUpdate({ _id: adjustmentId, cycleId: cycle._id, voidedAt: null }, { $set: { voidedAt: new Date(), voidedBy: ctx.userId, voidReason: reason } })
    if (!adj) return fail('That adjustment was already removed. The page has been refreshed.')
    await audit(ctx, { action: 'payroll.adjustment_voided', entity: 'Employee', entityId: adj.employeeId, summary: `Payroll adjustment removed: ${adj.label} (${formatINR(adj.amount)}), ${cycleLabel(cycle)}`, product: 'muster', meta: { reason } })
    revalidatePath(`/app/hr/payroll/${id}`)
    return ok(`${adj.label} removed. Regenerate payroll to apply it.`)
  },
  OPTS,
)

export const verifyBankChange = action(z.object({ id: objectId }), async ({ id }, ctx) => verifyBankChangeCore(ctx, id), BANK_VERIFY_OPTS)
