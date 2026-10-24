'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { isoDate, objectId, requiredText } from '@/lib/validation'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { recordUsage } from '@/lib/usage'
import { Deal } from '@/models/orbit/Deal'
import { Quote } from '@/models/folio/Quote'
import { FOLIO } from '../context'
import { invoiceFormSchema, type InvoiceFormInput } from './schemas'
import { createDraftInvoice, deleteDraftInvoice, duplicateInvoice, updateDraftInvoice, type DraftSpec } from './service'
import { emitInvoiceIssued } from '@/modules/automations/folio-events'
import { cancelStaleLinks } from '@/modules/payments/link-service'
import { issueInvoice, undoWriteOff, voidInvoice, writeOffInvoice } from './lifecycle'
import { emailInvoice } from './email'

const refresh = (id?: unknown, clientId?: unknown) => {
  revalidatePath('/app/folio')
  revalidatePath('/app/folio/invoices')
  if (id) revalidatePath(`/app/folio/invoices/${id}`)
  if (clientId) revalidatePath(`/app/clients/${clientId}`)
}

/** A deal or quote id posted with the form must belong to this workspace. */
async function linksExist(ctx: Ctx, input: InvoiceFormInput): Promise<boolean> {
  if (input.dealId && !(await ctx.db(Deal).exists({ _id: input.dealId }))) return false
  return !input.quoteId || Boolean(await ctx.db(Quote).exists({ _id: input.quoteId }))
}

const toSpec = (input: InvoiceFormInput): DraftSpec => ({ ...input, dealId: input.dealId ?? null, quoteId: input.quoteId ?? null })

/** Creates or (with `id`) replaces a draft. The server re-prices everything. */
export const saveInvoiceDraft = action(
  invoiceFormSchema,
  async (input, ctx) => {
    if (!(await linksExist(ctx, input))) return fail('That deal or quote is not in this workspace.')
    if (input.id) {
      const saved = await updateDraftInvoice(ctx, input.id, toSpec(input))
      await audit(ctx, { action: 'invoice.draft_updated', entity: 'Invoice', entityId: saved.id, summary: `Edited draft invoice for ${saved.clientName} (${formatINR(saved.totalPaise)})`, product: 'folio' })
      refresh(saved.id, input.clientId)
      return ok(`Draft invoice for ${saved.clientName} saved`, { id: String(saved.id) }, `/app/folio/invoices/${saved.id}`)
    }
    const created = await createDraftInvoice(ctx, toSpec(input))
    await audit(ctx, { action: 'invoice.draft_created', entity: 'Invoice', entityId: created.id, summary: `Drafted an invoice for ${created.clientName} (${formatINR(created.totalPaise)})`, product: 'folio' })
    if (!ctx.can('invoices.issue')) {
      await notifyPermission(ctx, 'invoices.issue', { title: `Draft invoice for ${created.clientName} (${formatINR(created.totalPaise, { decimals: 0 })}) is ready to issue`, href: `/app/folio/invoices/${created.id}`, kind: 'approval', product: 'folio', event: 'folio.draft_ready' })
    }
    refresh(created.id, input.clientId)
    return ok(`Draft invoice for ${created.clientName} saved`, { id: String(created.id) }, `/app/folio/invoices/${created.id}`)
  },
  { ...FOLIO, perm: 'invoices.write' },
)

export const issueInvoiceAction = action(
  z.object({ id: objectId, issueDate: z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional()) }),
  async ({ id, issueDate }, ctx) => {
    const issued = await issueInvoice(ctx, id, { issueDate })
    recordUsage({ kind: 'invoice_issued', orgId: ctx.orgId, userId: ctx.userId, product: 'folio' })
    await audit(ctx, { action: 'invoice.issued', entity: 'Invoice', entityId: id, summary: `Issued invoice ${issued.number} to ${issued.clientName} (${formatINR(issued.totalPaise)})`, product: 'folio', meta: { totalPaise: issued.totalPaise } })
    refresh(id, issued.invoice.clientId)
    await emitInvoiceIssued(ctx.orgId, id)
    return ok(`Invoice ${issued.number} issued`)
  },
  { ...FOLIO, perm: 'invoices.issue' },
)

const reasonSchema = z.object({ id: objectId, reason: requiredText('Reason', 500) })

export const voidInvoiceAction = action(
  reasonSchema,
  async ({ id, reason }, ctx) => {
    const invoice = await voidInvoice(ctx, id, reason)
    await cancelStaleLinks(ctx, [id])
    await audit(ctx, { action: 'invoice.voided', entity: 'Invoice', entityId: id, summary: `Voided invoice ${invoice.number}`, product: 'folio', meta: { reason } })
    refresh(id, invoice.clientId)
    return ok(`Invoice ${invoice.number} voided. Its number stays spent, as the series requires.`)
  },
  { ...FOLIO, perm: 'invoices.void' },
)

export const writeOffInvoiceAction = action(
  reasonSchema,
  async ({ id, reason }, ctx) => {
    const { invoice, amountPaise } = await writeOffInvoice(ctx, id, reason)
    await cancelStaleLinks(ctx, [id])
    await audit(ctx, { action: 'invoice.written_off', entity: 'Invoice', entityId: id, summary: `Wrote off ${formatINR(amountPaise)} on invoice ${invoice.number}`, product: 'folio', meta: { reason, amountPaise } })
    refresh(id, invoice.clientId)
    return ok('Written off. It stays in the ledger as a write-off, not as a payment.')
  },
  { ...FOLIO, perm: 'invoices.issue' },
)

export const undoWriteOffAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const invoice = await undoWriteOff(ctx, id)
    await audit(ctx, { action: 'invoice.write_off_undone', entity: 'Invoice', entityId: id, summary: `Undid the write-off on invoice ${invoice.number}`, product: 'folio' })
    refresh(id, invoice.clientId)
    return ok(`Write-off undone. ${invoice.number} is owed again.`)
  },
  { ...FOLIO, perm: 'invoices.issue' },
)

export const deleteDraftInvoiceAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const invoice = await deleteDraftInvoice(ctx, id)
    await audit(ctx, { action: 'invoice.draft_deleted', entity: 'Invoice', entityId: id, summary: `Deleted a draft invoice (${formatINR(invoice.totalPaise)})`, product: 'folio' })
    refresh(undefined, invoice.clientId)
    return ok('Draft deleted. No number was spent.', undefined, '/app/folio/invoices')
  },
  { ...FOLIO, anyPerm: ['invoices.write', 'invoices.issue'] },
)

export const duplicateInvoiceAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const created = await duplicateInvoice(ctx, id)
    await audit(ctx, { action: 'invoice.draft_created', entity: 'Invoice', entityId: created.id, summary: `Duplicated an invoice as a new draft for ${created.clientName}`, product: 'folio' })
    refresh(created.id)
    return ok(`Draft invoice for ${created.clientName} created from the copy`, { id: String(created.id) }, `/app/folio/invoices/${created.id}/edit`)
  },
  { ...FOLIO, perm: 'invoices.write' },
)

export const emailInvoiceAction = action(
  z.object({ id: objectId, recipientIds: z.array(z.string().min(1)).min(1, 'Pick at least one recipient'), cc: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().toLowerCase().email('Enter a valid email address').optional()), subject: requiredText('Subject', 200), message: requiredText('Message', 5000) }),
  async (input, ctx) => {
    const result = await emailInvoice(ctx, input)
    if (!result.ok) return fail(result.error)
    await audit(ctx, { action: 'invoice.emailed', entity: 'Invoice', entityId: input.id, summary: `Emailed invoice ${result.number} to ${result.to}`, product: 'folio' })
    refresh(input.id)
    return ok(result.message)
  },
  { ...FOLIO, anyPerm: ['invoices.write', 'invoices.issue'] },
)
