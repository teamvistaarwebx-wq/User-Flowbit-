'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatINR } from '@/lib/money'
import { objectId, requiredText } from '@/lib/validation'
import { Quote } from '@/models/folio/Quote'
import { FOLIO } from '../context'
import { quoteFormSchema } from '../invoices/schemas'
import { getFolioSettings } from '../settings/queries'
import { emailQuote } from './email'
import { convertQuote, createQuote, deleteQuote, duplicateQuote, moveQuote, quoteName, updateQuote } from './service'

const refresh = (id?: unknown) => {
  revalidatePath('/app/folio/quotes')
  if (id) revalidatePath(`/app/folio/quotes/${id}`)
}

export const saveQuote = action(
  quoteFormSchema,
  async (input, ctx) => {
    if (input.id) {
      const before = await updateQuote(ctx, input.id, input)
      await audit(ctx, { action: 'quote.updated', entity: 'Quote', entityId: before._id, summary: `Edited ${quoteName(before)}`, product: 'folio' })
      refresh(before._id)
      return ok(`${quoteName(before)} saved`, { id: String(before._id) }, `/app/folio/quotes/${before._id}`)
    }
    const created = await createQuote(ctx, input)
    await audit(ctx, { action: 'quote.created', entity: 'Quote', entityId: created.id, summary: `Created ${quoteName(created)}`, product: 'folio' })
    refresh()
    return ok(`${quoteName(created)} saved`, { id: String(created.id) }, `/app/folio/quotes/${created.id}`)
  },
  { ...FOLIO, perm: 'quotes.write' },
)

export const moveQuoteAction = action(
  z.object({ id: objectId, to: z.enum(['sent', 'accepted', 'declined']), reason: z.string().trim().max(500).optional() }),
  async ({ id, to, reason }, ctx) => {
    const quote = await moveQuote(ctx, id, to, reason)
    await audit(ctx, { action: `quote.${to}`, entity: 'Quote', entityId: quote._id, summary: `${quoteName(quote)} marked ${to}`, product: 'folio', meta: reason ? { reason } : undefined })
    refresh(id)
    return ok(`${quoteName(quote)} marked ${to}`)
  },
  { ...FOLIO, perm: 'quotes.write' },
)

export const convertQuoteAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    ctx.assert('invoices.write', 'Converting to an invoice needs permission to create invoices.')
    const { invoiceId, quote } = await convertQuote(ctx, id)
    await audit(ctx, { action: 'quote.converted', entity: 'Quote', entityId: quote._id, summary: `Converted ${quoteName(quote)} (${formatINR(quote.totalPaise)}) into a draft invoice`, product: 'folio', meta: { invoiceId: String(invoiceId) } })
    refresh(id)
    revalidatePath('/app/folio/invoices')
    return ok('Draft invoice created from the quote. Review it before issuing.', undefined, `/app/folio/invoices/${invoiceId}`)
  },
  { ...FOLIO, perm: 'quotes.write' },
)

export const deleteQuoteAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const quote = await deleteQuote(ctx, id)
    await audit(ctx, { action: 'quote.deleted', entity: 'Quote', entityId: quote._id, summary: `Deleted draft ${quoteName(quote)}`, product: 'folio' })
    refresh()
    return ok(`${quoteName(quote)} deleted`, undefined, '/app/folio/quotes')
  },
  { ...FOLIO, perm: 'quotes.write' },
)

export const duplicateQuoteAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const settings = await getFolioSettings(ctx)
    const created = await duplicateQuote(ctx, id, settings.invoicing?.defaultValidityDays ?? 15)
    await audit(ctx, { action: 'quote.created', entity: 'Quote', entityId: created.id, summary: `Duplicated a quote as ${quoteName(created)}`, product: 'folio' })
    refresh()
    return ok(`${quoteName(created)} created from the copy`, undefined, `/app/folio/quotes/${created.id}?edit=1`)
  },
  { ...FOLIO, perm: 'quotes.write' },
)

export const emailQuoteAction = action(
  z.object({ id: objectId, recipientIds: z.array(z.string().min(1)).min(1, 'Pick at least one recipient'), cc: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().toLowerCase().email('Enter a valid email address').optional()), subject: requiredText('Subject', 200), message: requiredText('Message', 5000) }),
  async (input, ctx) => {
    const result = await emailQuote(ctx, input)
    if (!result.ok) return fail(result.error)
    const quote = await ctx.db(Quote).findById(input.id, { kind: 1, number: 1 }).lean()
    await audit(ctx, { action: 'quote.emailed', entity: 'Quote', entityId: input.id, summary: `Emailed ${quote ? quoteName(quote) : 'a quote'} to ${result.to}`, product: 'folio' })
    refresh(input.id)
    return ok(result.message)
  },
  { ...FOLIO, perm: 'quotes.write' },
)
