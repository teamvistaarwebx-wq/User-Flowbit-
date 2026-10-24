'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { formatINR } from '@/lib/money'
import { notifyMembers } from '@/lib/notify'
import { isoDate, objectId, optionalText, paise, requiredText } from '@/lib/validation'
import { Client } from '@/models/Client'
import { Invoice } from '@/models/folio/Invoice'
import { FolioReceipt } from '@/models/folio/Receipt'
import { emitPaymentReceived } from '@/modules/automations/folio-events'
import { cancelStaleLinks } from '@/modules/payments/link-service'
import { RECEIPT_MODES } from './rules'
import { allocateReceipt, closeReceipt, recordReceipt, unallocateReceipt } from './service'

const FOLIO = { product: 'folio', perm: 'receipts.write' } as const

const optionalPaise = paise.optional().transform((v) => v ?? 0)

const recordSchema = z.object({
  clientId: objectId,
  entityId: objectId,
  amount: paise.refine((v) => v > 0, 'Enter the amount received'),
  receivedOn: isoDate,
  mode: z.enum(RECEIPT_MODES, { error: 'Choose how the money arrived' }),
  reference: optionalText(80),
  bankAccountId: objectId.optional(),
  instrumentDate: isoDate.optional(),
  notes: optionalText(1000),
  allocations: z.array(z.object({ invoiceId: objectId, amount: optionalPaise, tds: optionalPaise })).max(200).optional().default([]),
})

function revalidateMoney(extra: string[] = []) {
  for (const path of ['/app/folio', '/app/folio/receipts', '/app/folio/invoices', '/app/folio/ledger', '/app/folio/collections', ...extra]) revalidatePath(path)
}

export const recordReceiptAction = action(
  recordSchema,
  async (input, ctx) => {
    const result = await recordReceipt(ctx, {
      clientId: input.clientId,
      entityId: input.entityId,
      receivedOn: input.receivedOn,
      amountPaise: input.amount,
      mode: input.mode,
      reference: input.reference,
      bankAccountId: input.bankAccountId,
      instrumentDate: input.instrumentDate,
      notes: input.notes,
      allocations: input.allocations.map((a) => ({ invoiceId: a.invoiceId, amountPaise: a.amount, tdsPaise: a.tds })),
    })
    await cancelStaleLinks(ctx, input.allocations.map((a) => a.invoiceId))
    const client = await ctx.db(Client).findById(input.clientId, { name: 1 }).lean()
    await audit(ctx, { action: 'receipt.recorded', entity: 'FolioReceipt', entityId: result.id, product: 'folio', summary: `Recorded ${result.number}: ${formatINR(input.amount)} from ${client?.name ?? 'client'}`, meta: { amountPaise: input.amount, allocatedPaise: result.allocatedPaise } })
    revalidateMoney([`/app/folio/ledger/${input.clientId}`])
    await emitPaymentReceived(ctx.orgId, { receiptId: result.id, receiptNumber: result.number, clientId: input.clientId, receivedOn: input.receivedOn, allocations: input.allocations.map((a) => ({ invoiceId: a.invoiceId, amountPaise: a.amount })) })
    const message = result.unallocatedPaise > 0 ? `${result.number} recorded. ${formatINR(result.unallocatedPaise)} is held as advance credit.` : `${result.number} recorded and applied.`
    return ok(message, { id: result.id }, `/app/folio/receipts/${result.id}`)
  },
  FOLIO,
)

export const allocateReceiptAction = action(
  z.object({ receiptId: objectId, invoiceId: objectId, amount: optionalPaise, tds: optionalPaise }),
  async (input, ctx) => {
    const result = await allocateReceipt(ctx, { receiptId: input.receiptId, invoiceId: input.invoiceId, amountPaise: input.amount, tdsPaise: input.tds })
    await cancelStaleLinks(ctx, [input.invoiceId])
    const receipt = await ctx.db(FolioReceipt).findById(input.receiptId, { clientId: 1, receivedOn: 1 }).lean()
    if (receipt) await emitPaymentReceived(ctx.orgId, { receiptId: input.receiptId, receiptNumber: result.number, clientId: receipt.clientId, receivedOn: receipt.receivedOn, allocations: [{ invoiceId: input.invoiceId, amountPaise: input.amount }] })
    await audit(ctx, { action: 'receipt.allocated', entity: 'FolioReceipt', entityId: input.receiptId, product: 'folio', summary: `Applied ${formatINR(input.amount)} of ${result.number} to ${result.invoiceNumber ?? 'an invoice'}`, meta: { invoiceId: input.invoiceId, amountPaise: input.amount, tdsPaise: input.tds } })
    revalidateMoney([`/app/folio/receipts/${input.receiptId}`, `/app/folio/invoices/${input.invoiceId}`])
    return ok(`Applied ${formatINR(input.amount)} to ${result.invoiceNumber ?? 'the invoice'}.`)
  },
  FOLIO,
)

export const unallocateReceiptAction = action(
  z.object({ receiptId: objectId, allocationId: objectId }),
  async (input, ctx) => {
    const result = await unallocateReceipt(ctx, input)
    await audit(ctx, { action: 'receipt.released', entity: 'FolioReceipt', entityId: input.receiptId, product: 'folio', summary: `Released ${formatINR(result.freedPaise)} of ${result.number} from ${result.invoiceNumber ?? 'an invoice'}` })
    revalidateMoney([`/app/folio/receipts/${input.receiptId}`])
    return ok(`Released. ${result.invoiceNumber ?? 'The invoice'} is owed again and ${formatINR(result.freedPaise)} is free credit.`)
  },
  FOLIO,
)

async function notifyBounce(ctx: Ctx, number: string, clientName: string, invoiceIds: string[]) {
  if (!invoiceIds.length) return
  const creators: unknown[] = await ctx.db(Invoice).distinct('createdBy', { _id: { $in: invoiceIds } })
  await notifyMembers(ctx, creators.filter(Boolean).map(String), {
    title: `Payment ${number} from ${clientName} bounced`,
    body: `${invoiceIds.length === 1 ? '1 invoice is' : `${invoiceIds.length} invoices are`} owed again.`,
    href: '/app/folio/collections',
    kind: 'warning',
    product: 'folio',
    event: 'folio.receipt_bounced',
  })
}

export const bounceReceiptAction = action(
  z.object({ receiptId: objectId, bouncedOn: isoDate, reason: requiredText('Reason', 300) }),
  async (input, ctx) => {
    const result = await closeReceipt(ctx, input.receiptId, { status: 'bounced', bouncedOn: input.bouncedOn, reason: input.reason })
    const client = await ctx.db(Client).findById(result.clientId, { name: 1 }).lean()
    await audit(ctx, { action: 'receipt.bounced', entity: 'FolioReceipt', entityId: input.receiptId, product: 'folio', summary: `Marked ${result.number} bounced: ${input.reason}`, meta: { reason: input.reason, invoiceIds: result.invoiceIds } })
    await notifyBounce(ctx, result.number, client?.name ?? 'the client', result.invoiceIds)
    revalidateMoney([`/app/folio/receipts/${input.receiptId}`])
    return ok('Marked bounced. Every invoice it had settled is owed again and back on the collections list.')
  },
  FOLIO,
)

export const cancelReceiptAction = action(
  z.object({ receiptId: objectId, reason: requiredText('Reason', 300) }),
  async (input, ctx) => {
    const result = await closeReceipt(ctx, input.receiptId, { status: 'cancelled', reason: input.reason })
    await audit(ctx, { action: 'receipt.cancelled', entity: 'FolioReceipt', entityId: input.receiptId, product: 'folio', summary: `Cancelled ${result.number}: ${input.reason}`, meta: { reason: input.reason } })
    revalidateMoney([`/app/folio/receipts/${input.receiptId}`])
    return ok(`${result.number} cancelled. Record it again if the details were wrong.`)
  },
  FOLIO,
)
