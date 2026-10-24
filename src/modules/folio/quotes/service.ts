import type { Types } from 'mongoose'
import { addDays, todayIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { Deal } from '@/models/orbit/Deal'
import { Quote } from '@/models/folio/Quote'
import type { FolioDb } from '../context'
import { takeNumber } from '../counter'
import { buildDocument, formContentOf } from '../invoices/build'
import { storedPricing } from '../invoices/pricing'
import type { QuoteFormInput } from '../invoices/schemas'
import { createDraftInvoice, type ServiceCtx } from '../invoices/service'
import { withTxn } from '../txn'
import type { QuoteStatus } from '../types'
import { CONVERTIBLE_STATUSES, EDITABLE_STATUSES, quoteEditRefusal } from './rules'

/**
 * Quotes and proformas: priced exactly like invoices, numbered on creation,
 * editable while draft or sent (accepted and declined quotes keep their figures).
 */

export async function loadQuote(ctx: FolioDb, id: unknown) {
  const quote = await ctx.db(Quote).findById(id).lean()
  if (!quote) throw new NotFoundError('That quote')
  return quote
}

export type QuoteDoc = Awaited<ReturnType<typeof loadQuote>>

/** Draft or sent with a validity date in the past. */
export const isExpired = (quote: { status: string; validUntil: string }, today = todayIST()): boolean => (quote.status === 'draft' || quote.status === 'sent') && quote.validUntil < today

/** "Quote" or "Proforma" + number, for toasts and titles. */
export const quoteName = (quote: { kind: string; number: string }) => `${quote.kind === 'proforma' ? 'Proforma' : 'Quote'} ${quote.number}`

async function assertDeal(ctx: FolioDb, dealId: string | undefined): Promise<void> {
  if (dealId && !(await ctx.db(Deal).exists({ _id: dealId }))) throw new UserError('That deal is not in this workspace.')
}

async function quoteFields(ctx: FolioDb, input: QuoteFormInput) {
  await assertDeal(ctx, input.dealId)
  const built = await buildDocument(ctx, input, { tdsPercent: 0 })
  return {
    built,
    fields: {
      kind: input.kind,
      entityId: built.entity._id,
      clientId: built.client._id,
      dealId: input.dealId ?? null,
      quoteDate: input.quoteDate,
      validUntil: input.validUntil,
      ...storedPricing(built.priced),
      subject: input.subject,
      notes: input.notes ?? built.entity.defaults?.notes ?? undefined,
      terms: input.terms ?? built.entity.defaults?.terms ?? undefined,
    },
  }
}

export async function createQuote(ctx: ServiceCtx, input: QuoteFormInput): Promise<{ id: Types.ObjectId; number: string; kind: string }> {
  const { built, fields } = await quoteFields(ctx, input)
  const taken = await takeNumber(ctx.orgId, built.entity, input.kind, input.quoteDate)
  const quote = await ctx.db(Quote).create({ ...fields, number: taken.number, fyLabel: taken.fyLabel, status: 'draft', createdBy: ctx.memberId })
  return { id: quote._id, number: quote.number, kind: quote.kind }
}

/** Re-prices a quote. A change of entity or kind takes a number from the new series. */
export async function updateQuote(ctx: ServiceCtx, id: string, input: QuoteFormInput): Promise<QuoteDoc> {
  const current = await loadQuote(ctx, id)
  const refusal = quoteEditRefusal(current.status)
  if (refusal) throw new UserError(refusal)
  const { built, fields } = await quoteFields(ctx, input)
  const renumber = String(current.entityId) !== String(built.entity._id) || current.kind !== input.kind
  const taken = renumber ? await takeNumber(ctx.orgId, built.entity, input.kind, input.quoteDate) : null
  const res = await ctx.db(Quote).updateOne({ _id: current._id, status: { $in: [...EDITABLE_STATUSES] } }, { $set: { ...fields, ...(taken ? { number: taken.number, fyLabel: taken.fyLabel } : {}) } })
  if (!res.matchedCount) throw new UserError('The client responded to this quote a moment ago, so it can no longer change. Duplicate it to quote new figures.')
  return current
}

const MOVES: Record<'sent' | 'accepted' | 'declined', QuoteStatus[]> = { sent: ['draft', 'sent'], accepted: ['draft', 'sent'], declined: ['draft', 'sent', 'accepted'] }

export async function moveQuote(ctx: FolioDb, id: string, to: 'sent' | 'accepted' | 'declined', reason?: string): Promise<QuoteDoc> {
  const quote = await loadQuote(ctx, id)
  if (!MOVES[to].includes(quote.status)) throw new UserError(`A ${quote.status} quote cannot be marked ${to}.`)
  if (to === 'declined' && !reason?.trim()) throw new UserError('Say why the client declined, for the record.')
  const now = new Date()
  const set = to === 'sent' ? { status: 'sent', sentAt: now } : to === 'accepted' ? { status: 'accepted', acceptedAt: now } : { status: 'declined', declinedAt: now, declineReason: reason?.trim() }
  await ctx.db(Quote).updateOne({ _id: quote._id }, { $set: set })
  return quote
}

/** Creates an invoice draft from the quote; the quote becomes converted at once, so it cannot convert twice. */
export async function convertQuote(ctx: ServiceCtx, id: string): Promise<{ invoiceId: Types.ObjectId; quote: QuoteDoc }> {
  const quote = await loadQuote(ctx, id)
  if (!(CONVERTIBLE_STATUSES as readonly string[]).includes(quote.status)) throw new UserError(`A ${quote.status} quote cannot be converted.`)
  if (isExpired(quote)) throw new UserError('This quote has expired. Extend "Valid until" first, then convert it.')
  const draft = await withTxn(async (session) => {
    const created = await createDraftInvoice(
      ctx,
      {
        entityId: String(quote.entityId),
        clientId: String(quote.clientId),
        ...formContentOf(quote),
        issueDate: todayIST(),
        subject: quote.subject ?? undefined,
        notes: quote.notes ?? undefined,
        terms: quote.terms ?? undefined,
        quoteId: quote._id,
        dealId: quote.dealId,
      },
      session,
    )
    const res = await ctx.db(Quote).updateOne({ _id: quote._id, status: quote.status }, { $set: { status: 'converted', convertedInvoiceId: created.id, statusBeforeConvert: quote.status } }, { session })
    if (!res.matchedCount) throw new UserError('This quote changed or was converted a moment ago. Reload it and try again.')
    return created
  })
  return { invoiceId: draft.id, quote }
}

export async function deleteQuote(ctx: FolioDb, id: string): Promise<QuoteDoc> {
  const quote = await loadQuote(ctx, id)
  if (quote.status !== 'draft') throw new UserError('Only a draft quote can be deleted. Mark it declined instead.')
  await ctx.db(Quote).deleteOne({ _id: quote._id, status: 'draft' })
  return quote
}

export async function duplicateQuote(ctx: ServiceCtx, id: string, validityDays: number): Promise<{ id: Types.ObjectId; number: string; kind: string }> {
  const q = await loadQuote(ctx, id)
  const today = todayIST()
  return createQuote(ctx, {
    kind: q.kind,
    entityId: String(q.entityId),
    clientId: String(q.clientId),
    ...formContentOf(q),
    subject: q.subject ?? undefined,
    notes: q.notes ?? undefined,
    terms: q.terms ?? undefined,
    dealId: q.dealId ? String(q.dealId) : undefined,
    quoteDate: today,
    validUntil: addDays(today, validityDays),
  })
}
