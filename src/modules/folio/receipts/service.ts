import 'server-only'
import { Types, type ClientSession } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioReceipt } from '@/models/folio/Receipt'
import { loadClient, loadEntity, entityLabel } from '@/modules/folio/context'
import { takeNumber } from '@/modules/folio/counter'
import { outstandingFor, recalcInvoiceSettlement } from '@/modules/folio/settlement'
import { withTxn } from '@/modules/folio/txn'
import { allocatedPaise, receiptIssue, type ReceiptMode } from './rules'

/**
 * Receipts and allocation (folio.md 6.8). Every allocation path recalculates
 * the invoice inside the same transaction: that write is what makes two
 * concurrent allocations to one invoice conflict, so one retries and is
 * refused. Reads inside a transaction run one after another (a session must
 * not be used in parallel).
 */

export type AllocationInput = { invoiceId: string; amountPaise: number; tdsPaise: number }

export type RecordReceiptInput = {
  clientId: string
  entityId: string
  receivedOn: string
  amountPaise: number
  mode: ReceiptMode
  reference?: string
  bankAccountId?: string
  instrumentDate?: string
  notes?: string
  allocations: AllocationInput[]
}

/** What recording a receipt needs: the org-scoped db, and the member recording it (none for a gateway webhook). */
export type ReceiptCtx = Pick<Ctx, 'db' | 'orgId'> & { memberId?: Types.ObjectId }

type Party = { clientId: Types.ObjectId; entityId: Types.ObjectId; entityName: string }

async function entityNames(ctx: ReceiptCtx): Promise<Map<string, string>> {
  const rows = await ctx.db(FolioEntity).find({}, { legalName: 1, tradeName: 1 }).lean()
  return new Map(rows.map((e) => [String(e._id), entityLabel(e)]))
}

/** Checks one allocation against fresh source rows; throws a UserError naming the invoice. */
async function assertAllocatable(ctx: ReceiptCtx, party: Party, a: AllocationInput, session: ClientSession, field: string, excludeReceiptId?: Types.ObjectId, alreadyOnRow = 0): Promise<void> {
  const o = await outstandingFor(ctx, a.invoiceId, session, excludeReceiptId)
  const label = o.number ? `Invoice ${o.number}` : 'That invoice'
  if (String(o.clientId) !== String(party.clientId)) throw new UserError('That invoice belongs to another client.', { [field]: 'Belongs to another client' })
  if (String(o.entityId) !== String(party.entityId)) {
    const names = await entityNames(ctx)
    throw new UserError(`Money received into ${party.entityName} cannot settle a ${names.get(String(o.entityId)) ?? 'different entity'} invoice.`, { [field]: 'Billed by another entity' })
  }
  if (o.status === 'draft') throw new UserError(`${label} is still a draft. Issue it before taking a payment against it.`, { [field]: 'Still a draft' })
  if (o.status !== 'issued' && o.status !== 'part_paid') throw new UserError(`${label} is ${o.status === 'void' ? 'void' : 'already paid'} and cannot take a payment.`, { [field]: 'Not open' })
  if (alreadyOnRow + a.amountPaise + a.tdsPaise > o.outstanding) throw new UserError(`${label} has only ${formatINR(Math.max(0, o.outstanding - alreadyOnRow))} outstanding.`, { [field]: `Only ${formatINR(Math.max(0, o.outstanding - alreadyOnRow))} owed` })
}

async function recalcAll(ctx: ReceiptCtx, invoiceIds: readonly string[], session: ClientSession): Promise<void> {
  for (const id of new Set(invoiceIds)) await recalcInvoiceSettlement(ctx, id, session)
}

export async function recordReceipt(ctx: ReceiptCtx, input: RecordReceiptInput): Promise<{ id: string; number: string; allocatedPaise: number; unallocatedPaise: number }> {
  if (input.receivedOn > todayIST()) throw new UserError('A payment cannot be received in the future.', { receivedOn: 'Use today or an earlier date' })
  const [entity, client] = await Promise.all([loadEntity(ctx, input.entityId, { active: true }), loadClient(ctx, input.clientId)])
  if (input.bankAccountId && !(entity.bankAccounts ?? []).some((b) => String(b._id) === input.bankAccountId)) throw new UserError(`That bank account does not belong to ${entity.code}.`, { bankAccountId: 'Pick one of this entity’s accounts' })
  const allocations = input.allocations.filter((a) => a.amountPaise + a.tdsPaise > 0)
  const issue = receiptIssue(input.amountPaise, allocations)
  if (issue) throw new UserError(issue, { amount: issue })
  const party: Party = { clientId: client._id, entityId: entity._id, entityName: entityLabel(entity) }

  const created = await withTxn(async (session) => {
    for (const [i, a] of input.allocations.entries()) {
      if (a.amountPaise + a.tdsPaise > 0) await assertAllocatable(ctx, party, a, session, `allocations.${i}.amount`)
    }
    const taken = await takeNumber(ctx.orgId, entity, 'receipt', input.receivedOn, session)
    const receipt = await ctx.db(FolioReceipt).create(
      {
        ...taken,
        entityId: entity._id,
        clientId: client._id,
        receivedOn: input.receivedOn,
        amountPaise: input.amountPaise,
        mode: input.mode,
        reference: input.reference,
        bankAccountId: input.bankAccountId,
        instrumentDate: input.mode === 'cheque' ? input.instrumentDate : undefined,
        notes: input.notes,
        status: 'recorded',
        allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amountPaise: a.amountPaise, tdsPaise: a.tdsPaise, allocatedOn: todayIST(), allocatedBy: ctx.memberId })),
        recordedBy: ctx.memberId,
      },
      { session },
    )
    await recalcAll(ctx, allocations.map((a) => a.invoiceId), session)
    return { id: String(receipt._id), number: taken.number }
  })
  const applied = allocatedPaise(allocations)
  return { ...created, allocatedPaise: applied, unallocatedPaise: input.amountPaise - applied }
}

async function loadRecorded(ctx: Ctx, receiptId: string, session: ClientSession, verb: string) {
  const receipt = await ctx.db(FolioReceipt).findById(receiptId, null, { session }).lean()
  if (!receipt) throw new NotFoundError('That receipt')
  if (receipt.status !== 'recorded') throw new UserError(`A ${receipt.status} receipt cannot be ${verb}.`)
  return receipt
}

/** Applies leftover credit to one more invoice (tops up an existing row; never duplicates it). */
export async function allocateReceipt(ctx: Ctx, input: { receiptId: string; invoiceId: string; amountPaise: number; tdsPaise: number }): Promise<{ number: string; invoiceNumber: string | null }> {
  if (input.amountPaise + input.tdsPaise <= 0) throw new UserError('Enter an amount or TDS above zero.', { amount: 'Enter an amount' })
  return withTxn(async (session) => {
    const receipt = await loadRecorded(ctx, input.receiptId, session, 'allocated')
    const left = receipt.amountPaise - allocatedPaise(receipt.allocations)
    if (input.amountPaise > left) throw new UserError(`This receipt has only ${formatINR(left)} left to allocate.`, { amount: `Only ${formatINR(left)} left` })
    const entity = await ctx.db(FolioEntity).findById(receipt.entityId, { legalName: 1, tradeName: 1 }, { session }).lean()
    const party: Party = { clientId: receipt.clientId, entityId: receipt.entityId, entityName: entity ? entityLabel(entity) : 'this entity' }
    const existing = receipt.allocations.find((a) => String(a.invoiceId) === input.invoiceId)
    const onRow = (existing?.amountPaise ?? 0) + (existing?.tdsPaise ?? 0)
    await assertAllocatable(ctx, party, { invoiceId: input.invoiceId, amountPaise: input.amountPaise, tdsPaise: input.tdsPaise }, session, 'amount', receipt._id, onRow)
    const next = existing
      ? receipt.allocations.map((a) => (a === existing ? { ...a, amountPaise: (a.amountPaise ?? 0) + input.amountPaise, tdsPaise: (a.tdsPaise ?? 0) + input.tdsPaise, allocatedOn: todayIST(), allocatedBy: ctx.memberId } : a))
      : [...receipt.allocations, { _id: new Types.ObjectId(), invoiceId: new Types.ObjectId(input.invoiceId), amountPaise: input.amountPaise, tdsPaise: input.tdsPaise, allocatedOn: todayIST(), allocatedBy: ctx.memberId }]
    const issue = receiptIssue(receipt.amountPaise, next)
    if (issue) throw new UserError(issue)
    await ctx.db(FolioReceipt).updateOne({ _id: receipt._id, status: 'recorded' }, { $set: { allocations: next } }, { session })
    await recalcInvoiceSettlement(ctx, input.invoiceId, session)
    const fresh = await outstandingFor(ctx, input.invoiceId, session)
    return { number: receipt.number, invoiceNumber: fresh.number }
  })
}

/** Removes one allocation row; the invoice is owed again and the money returns to credit. */
export async function unallocateReceipt(ctx: Ctx, input: { receiptId: string; allocationId: string }): Promise<{ number: string; invoiceNumber: string | null; freedPaise: number }> {
  return withTxn(async (session) => {
    const receipt = await loadRecorded(ctx, input.receiptId, session, 'changed')
    const row = receipt.allocations.find((a) => String(a._id) === input.allocationId)
    if (!row) throw new NotFoundError('That allocation')
    await ctx.db(FolioReceipt).updateOne({ _id: receipt._id }, { $set: { allocations: receipt.allocations.filter((a) => a !== row) } }, { session })
    await recalcInvoiceSettlement(ctx, row.invoiceId, session)
    const o = await outstandingFor(ctx, row.invoiceId, session)
    return { number: receipt.number, invoiceNumber: o.number, freedPaise: row.amountPaise ?? 0 }
  })
}

type Closing = { status: 'bounced'; bouncedOn: string; reason: string } | { status: 'cancelled'; reason: string }

/**
 * Bounce or cancel: the receipt stays on record with its allocations (for the
 * trail), but a non-recorded receipt counts nowhere, so every invoice it
 * settled is owed again.
 */
export async function closeReceipt(ctx: Ctx, receiptId: string, closing: Closing): Promise<{ number: string; clientId: Types.ObjectId; invoiceIds: string[] }> {
  if (closing.status === 'bounced' && closing.bouncedOn > todayIST()) throw new UserError('A cheque cannot bounce in the future.', { bouncedOn: 'Use today or an earlier date' })
  return withTxn(async (session) => {
    const receipt = await loadRecorded(ctx, receiptId, session, closing.status === 'bounced' ? 'marked bounced' : 'cancelled')
    const set =
      closing.status === 'bounced'
        ? { status: 'bounced', bouncedOn: closing.bouncedOn, bounceReason: closing.reason }
        : { status: 'cancelled', cancelledAt: new Date(), cancelledBy: ctx.memberId, cancelReason: closing.reason }
    await ctx.db(FolioReceipt).updateOne({ _id: receipt._id, status: 'recorded' }, { $set: set }, { session })
    const invoiceIds = [...new Set(receipt.allocations.map((a) => String(a.invoiceId)))]
    await recalcAll(ctx, invoiceIds, session)
    return { number: receipt.number, clientId: receipt.clientId, invoiceIds }
  })
}
