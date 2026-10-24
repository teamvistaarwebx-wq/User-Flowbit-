import type { ClientSession, Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { Invoice } from '@/models/folio/Invoice'
import { FolioReceipt } from '@/models/folio/Receipt'
import { defaultEntityId, loadEntity, type ClientDoc, type FolioDb } from '../context'
import { financialYearOf } from '../engine/numbering'
import { documentTypeOf } from '../invoices/pricing'
import { billToOf, issuerOf } from '../invoices/snapshots'

/**
 * The opening balance is one issued invoice row (billingType 'opening', no
 * tax, number OB-<last 6 of client id>) so receipts can settle it and aging,
 * ledger and balances agree. It bypasses the counter and is kept out of
 * numbering, GST, revenue and PDFs.
 */

export const openingNumber = (clientId: Types.ObjectId | string) => `OB-${String(clientId).slice(-6).toUpperCase()}`

/** True when any recorded receipt is applied to the client's opening row. */
export async function openingHasPayments(ctx: FolioDb, clientId: Types.ObjectId, session?: ClientSession): Promise<boolean> {
  const row = await ctx.db(Invoice).findOne({ clientId, billingType: 'opening' }, { _id: 1 }, { session }).lean()
  return row ? Boolean(await ctx.db(FolioReceipt).exists({ status: 'recorded', 'allocations.invoiceId': row._id })) : false
}

export async function syncOpeningBalance(
  ctx: FolioDb & { memberId?: Types.ObjectId },
  client: ClientDoc,
  opening: { amountPaise: number; on: string | null; defaultEntityId?: Types.ObjectId | string | null },
  session?: ClientSession,
): Promise<'unchanged' | 'removed' | 'saved'> {
  const existing = await ctx.db(Invoice).findOne({ clientId: client._id, billingType: 'opening' }, null, { session }).lean()
  const same = existing && existing.totalPaise === opening.amountPaise && existing.issueDate === opening.on
  if (same || (!existing && opening.amountPaise === 0)) return 'unchanged'
  if (existing && (await openingHasPayments(ctx, client._id, session))) throw new UserError('Payments are already applied to the opening balance. Release them first.')
  if (existing && existing.writtenOffPaise > 0) throw new UserError('The opening balance is written off. Undo the write-off on it first, then change it.')
  if (existing) await ctx.db(Invoice).deleteOne({ _id: existing._id }, { session })
  if (opening.amountPaise === 0) return 'removed'
  if (!opening.on) throw new UserError('Some fields need attention.', { openingBalanceOn: 'Give the date the balance is as on' })
  const entityId = await defaultEntityId(ctx, { defaultEntityId: opening.defaultEntityId })
  if (!entityId) throw new UserError('Set up your firm in Folio settings before recording an opening balance.')
  const entity = await loadEntity(ctx, entityId)
  const amount = opening.amountPaise
  await ctx.db(Invoice).create(
    {
      number: openingNumber(client._id), fyLabel: financialYearOf(opening.on), seq: null, clientId: client._id, entityId: entity._id, documentType: documentTypeOf(entity.kind), status: 'issued',
      issueDate: opening.on, dueDate: opening.on, paymentTermsDays: 0, billingType: 'opening', supplyType: 'exempt', billTo: billToOf(client), from: issuerOf(entity),
      lines: [{ position: 1, description: `Opening balance as on ${formatDate(opening.on)}`, quantity: 1, unit: 'nos', ratePaise: amount, taxablePaise: amount, lineTotalPaise: amount }],
      subtotalPaise: amount, taxablePaise: amount, totalPaise: amount, balancePaise: amount, issuedAt: new Date(), issuedBy: ctx.memberId, createdBy: ctx.memberId,
    },
    session ? { session } : undefined,
  )
  return 'saved'
}
