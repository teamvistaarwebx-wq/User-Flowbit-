'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatINR } from '@/lib/money'
import { isoDate, objectId, requiredText } from '@/lib/validation'
import { CreditNote } from '@/models/folio/CreditNote'
import { cancelStaleLinks } from '@/modules/payments/link-service'
import { FOLIO } from '../context'
import { CREDIT_NOTE_REASONS } from '../types'
import { emailCreditNote } from './email'
import { cancelCreditNote, createCreditNote } from './service'

const refresh = (invoiceId?: unknown, id?: unknown) => {
  revalidatePath('/app/folio/credit-notes')
  revalidatePath('/app/folio/invoices')
  revalidatePath('/app/folio')
  if (invoiceId) revalidatePath(`/app/folio/invoices/${invoiceId}`)
  if (id) revalidatePath(`/app/folio/credit-notes/${id}`)
}

const creditNoteSchema = z.object({
  invoiceId: objectId,
  noteDate: isoDate,
  reason: z.enum(CREDIT_NOTE_REASONS, { error: 'Choose a reason' }),
  reasonText: requiredText('Reason text', 500).refine((v) => v.length >= 5, 'Describe the reason in a few words'),
  mode: z.enum(['full', 'lines']),
  lines: z.preprocess(
    (v) => v ?? [],
    z.array(z.object({ invoiceLineId: objectId, taxable: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number({ error: 'Enter an amount' }).min(0, 'Cannot be negative').optional()) })),
  ),
})

export const createCreditNoteAction = action(
  creditNoteSchema,
  async (input, ctx) => {
    const note = await createCreditNote(ctx, input)
    await cancelStaleLinks(ctx, [input.invoiceId])
    const saved = await ctx.db(CreditNote).findById(note.id, { totalPaise: 1, clientId: 1 }).lean()
    await audit(ctx, { action: 'credit_note.issued', entity: 'CreditNote', entityId: note.id, summary: `Issued credit note ${note.number} against ${note.invoiceNumber} (${formatINR(saved?.totalPaise ?? 0)})`, product: 'folio' })
    refresh(input.invoiceId, note.id)
    if (saved?.clientId) revalidatePath(`/app/clients/${saved.clientId}`)
    const issued = `Credit note ${note.number} issued against ${note.invoiceNumber}.`
    return ok(note.warning ? `${issued} ${note.warning}` : issued, { id: String(note.id) }, `/app/folio/credit-notes/${note.id}`)
  },
  { ...FOLIO, perm: 'credit_notes.write' },
)

export const cancelCreditNoteAction = action(
  z.object({ id: objectId, reason: requiredText('Reason', 500) }),
  async ({ id, reason }, ctx) => {
    const note = await cancelCreditNote(ctx, id, reason)
    await audit(ctx, { action: 'credit_note.cancelled', entity: 'CreditNote', entityId: note._id, summary: `Cancelled credit note ${note.number}`, product: 'folio', meta: { reason } })
    refresh(note.invoiceId, note._id)
    return ok(`Credit note ${note.number} cancelled. The invoice is owed again; the number stays spent.`)
  },
  { ...FOLIO, perm: 'credit_notes.write' },
)

export const emailCreditNoteAction = action(
  z.object({ id: objectId, recipientIds: z.array(z.string().min(1)).min(1, 'Pick at least one recipient'), cc: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().toLowerCase().email('Enter a valid email address').optional()), subject: requiredText('Subject', 200), message: requiredText('Message', 5000) }),
  async (input, ctx) => {
    const result = await emailCreditNote(ctx, input)
    if (!result.ok) return fail(result.error)
    await audit(ctx, { action: 'credit_note.emailed', entity: 'CreditNote', entityId: input.id, summary: `Emailed credit note ${result.number} to ${result.to}`, product: 'folio' })
    refresh(undefined, input.id)
    return ok(result.message)
  },
  { ...FOLIO, perm: 'credit_notes.write' },
)
