import { Types, type ClientSession } from 'mongoose'
import { NotFoundError } from '@/lib/errors'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { Invoice } from '@/models/folio/Invoice'
import { FolioReceipt } from '@/models/folio/Receipt'
import type { FolioDb } from './context'
import { deriveSettlement, milestoneStatusFor, outstandingOf, type InvoiceStatus } from './engine/settlement-math'

/**
 * The single writer of an invoice's paid, TDS received, credited, balance
 * and post-issue status. It always recomputes from source rows (recorded
 * receipts, issued credit notes), so a double or missed call converges.
 * Call it inside the same transaction as the allocation that changed: the
 * write to the invoice document is what makes concurrent allocations conflict.
 */

const asId = (id: Types.ObjectId | string) => (typeof id === 'string' ? new Types.ObjectId(id) : id)

async function receiptTotals(ctx: FolioDb, invoiceId: Types.ObjectId, session?: ClientSession | null, excludeReceiptId?: Types.ObjectId | string) {
  const rows = await ctx.db(FolioReceipt).aggregate<{ paid: number; tds: number }>(
    [
      { $match: { status: 'recorded', 'allocations.invoiceId': invoiceId, ...(excludeReceiptId ? { _id: { $ne: asId(excludeReceiptId) } } : {}) } },
      { $unwind: '$allocations' },
      { $match: { 'allocations.invoiceId': invoiceId } },
      { $group: { _id: null, paid: { $sum: '$allocations.amountPaise' }, tds: { $sum: '$allocations.tdsPaise' } } },
    ],
    session ? { session } : {},
  )
  return { paid: rows[0]?.paid ?? 0, tds: rows[0]?.tds ?? 0 }
}

async function creditedTotal(ctx: FolioDb, invoiceId: Types.ObjectId, session?: ClientSession | null): Promise<number> {
  const rows = await ctx.db(CreditNote).aggregate<{ credited: number }>([{ $match: { invoiceId, status: 'issued' } }, { $group: { _id: null, credited: { $sum: '$totalPaise' } } }], session ? { session } : {})
  return rows[0]?.credited ?? 0
}

export type SettlementResult = { status: InvoiceStatus; balance: number; paid: number; tds: number; credited: number }

export async function recalcInvoiceSettlement(ctx: FolioDb, invoiceId: Types.ObjectId | string, session?: ClientSession | null): Promise<SettlementResult> {
  const id = asId(invoiceId)
  const invoice = await ctx.db(Invoice).findById(id, { status: 1, totalPaise: 1, writtenOffPaise: 1, planId: 1, milestoneId: 1 }, { session }).lean()
  if (!invoice) throw new NotFoundError('That invoice')
  // Sequential: operations in one transaction session must not run in parallel.
  const { paid, tds } = await receiptTotals(ctx, id, session)
  const credited = await creditedTotal(ctx, id, session)
  const next = deriveSettlement({ status: invoice.status, total: invoice.totalPaise, paid, tds, credited, writtenOff: invoice.writtenOffPaise })
  await ctx.db(Invoice).updateOne({ _id: id }, { $set: { paidPaise: paid, tdsReceivedPaise: tds, creditedPaise: credited, balancePaise: next.balance, status: next.status } }, { session: session ?? undefined })
  if (invoice.planId && invoice.milestoneId && next.status !== 'draft' && next.status !== 'void') {
    await ctx.db(FolioBillingPlan).updateOne(
      { _id: invoice.planId, milestones: { $elemMatch: { _id: invoice.milestoneId, status: { $in: ['invoiced', 'paid'] } } } },
      { $set: { 'milestones.$.status': milestoneStatusFor(next.status) } },
      { session: session ?? undefined },
    )
  }
  return { status: next.status, balance: next.balance, paid, tds, credited }
}

/** Recalculates every invoice a receipt touches (bounce, cancel, release). */
export async function recalcForReceipt(ctx: FolioDb, receiptId: Types.ObjectId | string, session?: ClientSession | null): Promise<void> {
  const receipt = await ctx.db(FolioReceipt).findById(receiptId, { allocations: 1 }, { session }).lean()
  if (!receipt) throw new NotFoundError('That receipt')
  const ids = [...new Set(receipt.allocations.map((a) => String(a.invoiceId)))]
  for (const id of ids) await recalcInvoiceSettlement(ctx, id, session)
}

export type Outstanding = { total: number; settled: number; outstanding: number; number: string | null; status: InvoiceStatus; clientId: Types.ObjectId; entityId: Types.ObjectId }

/**
 * Fresh from source rows (not the denormalised fields): what an allocation or
 * credit note may still settle. `excludeReceiptId` leaves that receipt's own
 * allocation out, for topping up an existing row.
 */
export async function outstandingFor(ctx: FolioDb, invoiceId: Types.ObjectId | string, session?: ClientSession | null, excludeReceiptId?: Types.ObjectId | string): Promise<Outstanding> {
  const id = asId(invoiceId)
  const invoice = await ctx.db(Invoice).findById(id, { status: 1, totalPaise: 1, writtenOffPaise: 1, number: 1, clientId: 1, entityId: 1 }, { session }).lean()
  if (!invoice) throw new NotFoundError('That invoice')
  const { paid, tds } = await receiptTotals(ctx, id, session, excludeReceiptId)
  const credited = await creditedTotal(ctx, id, session)
  const settled = paid + tds + credited
  return {
    total: invoice.totalPaise,
    settled,
    outstanding: outstandingOf(invoice.totalPaise, settled, invoice.writtenOffPaise),
    number: invoice.number ?? null,
    status: invoice.status,
    clientId: invoice.clientId,
    entityId: invoice.entityId,
  }
}
