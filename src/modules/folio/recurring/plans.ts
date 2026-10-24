import type { Types } from 'mongoose'
import { NotFoundError, UserError } from '@/lib/errors'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { Invoice } from '@/models/folio/Invoice'
import type { FolioDb } from '../context'
import { createDraftInvoice, type ServiceCtx } from '../invoices/service'
import { withTxn } from '../txn'
import { milestoneAmount } from './plan-math'

/** Billing plans: phase invoices and what has been billed against the agreed value. */

export async function loadPlan(ctx: FolioDb, id: unknown) {
  const plan = await ctx.db(FolioBillingPlan).findById(id).lean()
  if (!plan) throw new NotFoundError('That billing plan')
  return plan
}

export type PlanDoc = Awaited<ReturnType<typeof loadPlan>>

/** "Invoiced" = Σ taxable of the plan's issued (non-void, non-draft) invoices; the value is agreed before tax. */
export async function invoicedByPlan(ctx: FolioDb, planIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (!planIds.length) return new Map()
  const rows = await ctx.db(Invoice).aggregate<{ _id: Types.ObjectId; taxable: number }>([
    { $match: { planId: { $in: planIds }, status: { $nin: ['draft', 'void'] } } },
    { $group: { _id: '$planId', taxable: { $sum: '$taxablePaise' } } },
  ])
  return new Map(rows.map((r) => [String(r._id), r.taxable]))
}

/** Creates a draft for one phase and links it; the phase becomes invoiced when that draft is issued. */
export async function generateMilestoneInvoice(ctx: ServiceCtx, planId: string, milestoneId: string, issueDate: string): Promise<{ invoiceId: Types.ObjectId; amountPaise: number; label: string }> {
  const plan = await loadPlan(ctx, planId)
  const phase = plan.milestones.find((m) => String(m._id) === milestoneId)
  if (!phase) throw new NotFoundError('That phase')
  if (phase.invoiceId) throw new UserError('That milestone has already been invoiced.')
  if (phase.status === 'cancelled') throw new UserError('A cancelled milestone cannot be invoiced.')
  if (plan.status === 'cancelled') throw new UserError('This plan is cancelled.')
  const amountPaise = milestoneAmount(plan.totalValuePaise, phase)
  if (amountPaise <= 0) throw new UserError('That milestone works out to nothing to bill.')
  const label = `${plan.name} · ${phase.name}`
  const invoiceId = await withTxn(async (session) => {
    const draft = await createDraftInvoice(
      ctx,
      {
        entityId: String(plan.entityId),
        clientId: String(plan.clientId),
        supplyMode: 'auto',
        lines: [{ description: `${plan.name} — ${phase.name}`, hsnSac: plan.hsnSac ?? undefined, quantity: 1, unit: 'phase', rate: amountPaise / 100, discountPercent: 0, gstRatePercent: plan.gstRatePercent }],
        discountType: 'none',
        discountValue: 0,
        issueDate,
        billingType: 'milestone',
        planId: plan._id,
        milestoneId: phase._id,
        subject: label,
      },
      session,
    )
    const res = await ctx.db(FolioBillingPlan).updateOne({ _id: plan._id, milestones: { $elemMatch: { _id: phase._id, invoiceId: null } } }, { $set: { 'milestones.$.invoiceId': draft.id } }, { session })
    if (!res.matchedCount) throw new UserError('That milestone has already been invoiced.')
    return draft.id
  })
  return { invoiceId, amountPaise, label }
}
