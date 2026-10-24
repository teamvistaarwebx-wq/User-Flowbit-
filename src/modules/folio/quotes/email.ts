import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { firstName } from '@/lib/utils'
import { Quote } from '@/models/folio/Quote'
import { renderQuotePdf } from '@/components/folio/pdf/QuotePdf'
import { pdfFilename } from '@/components/folio/pdf/InvoicePdf'
import { entityLabel, loadClient, loadEntity, type FolioDb } from '../context'
import type { EmailDefaults, EmailInput, EmailResult } from '../invoices/email'
import { mailMessage, onlineLine, recipientsFor, sendDocumentMail } from '../mail'
import { loadQuote, quoteName, type QuoteDoc } from './service'

/** Emailing a quote or proforma; sending marks a draft quote as sent. */

export async function quoteEmailDefaults(ctx: FolioDb, quote: QuoteDoc): Promise<EmailDefaults> {
  const [recipients, entity] = await Promise.all([recipientsFor(ctx, quote.clientId, 'invoices'), loadEntity(ctx, quote.entityId)])
  const name = quote.kind === 'proforma' ? 'proforma invoice' : 'quotation'
  const greeting = recipients[0] ? `Hi ${firstName(recipients[0].name)},` : 'Hello,'
  const online = await onlineLine(ctx, 'quote', quote._id, quote.clientId, 'View and accept')
  return {
    recipients,
    subject: `${quote.kind === 'proforma' ? 'Proforma invoice' : 'Quotation'} ${quote.number} from ${entityLabel(entity)} — ${formatINR(quote.totalPaise, { decimals: 0 })}`,
    message: `${greeting}\n\nPlease find attached our ${name} ${quote.number}${quote.subject ? ` for ${quote.subject}` : ''}, totalling ${formatINR(quote.totalPaise)}. It is valid until ${formatDate(quote.validUntil)}.${online}\n\nThanks,\n${entity.signatoryName ?? ''}\n${entityLabel(entity)}`,
  }
}

export async function emailQuote(ctx: FolioDb & Pick<Ctx, 'memberId'>, input: EmailInput): Promise<EmailResult> {
  const quote = await loadQuote(ctx, input.id)
  if (quote.status === 'declined') return { ok: false, error: 'This quote was declined. Duplicate it to send a fresh one.' }
  const [entity, client] = await Promise.all([loadEntity(ctx, quote.entityId), loadClient(ctx, quote.clientId)])
  const pdf = await renderQuotePdf(ctx.orgId, quote, entity, client)
  const outcome = await sendDocumentMail(ctx, {
    kind: 'quote',
    clientId: quote.clientId,
    recipientIds: input.recipientIds,
    cc: input.cc,
    subject: input.subject,
    message: input.message,
    attachment: { filename: pdfFilename(quote.number, 'quote'), content: pdf },
    quoteId: quote._id,
    entity: 'Quote',
    entityId: quote._id,
    online: { kind: 'quote', docId: quote._id },
  })
  if (outcome.error) return { ok: false, error: outcome.error }
  await ctx.db(Quote).updateOne({ _id: quote._id }, { $set: { lastEmailedAt: new Date(), ...(quote.status === 'draft' ? { status: 'sent', sentAt: new Date() } : {}) } })
  return { ok: true, message: mailMessage(quoteName(quote), outcome), number: quote.number, to: outcome.emails.join(', ') }
}
