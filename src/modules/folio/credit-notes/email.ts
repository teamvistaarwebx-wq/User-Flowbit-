import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { firstName } from '@/lib/utils'
import { CreditNote } from '@/models/folio/CreditNote'
import { renderCreditNotePdf } from '@/components/folio/pdf/CreditNotePdf'
import { pdfFilename } from '@/components/folio/pdf/InvoicePdf'
import type { FolioDb } from '../context'
import type { EmailDefaults, EmailInput, EmailResult } from '../invoices/email'
import { loadInvoice, type InvoiceDoc } from '../invoices/service'
import { mailMessage, onlineLine, recipientsFor, sendDocumentMail } from '../mail'
import { loadCreditNote, type CreditNoteDoc } from './service'

export async function creditNoteEmailDefaults(ctx: FolioDb, note: CreditNoteDoc, invoice: InvoiceDoc): Promise<EmailDefaults> {
  const recipients = await recipientsFor(ctx, note.clientId, 'invoices')
  const brand = invoice.from?.tradeName || invoice.from?.legalName || ''
  const greeting = recipients[0] ? `Hi ${firstName(recipients[0].name)},` : 'Hello,'
  const online = await onlineLine(ctx, 'credit_note', note._id, note.clientId, 'View')
  return {
    recipients,
    subject: `Credit note ${note.number} against invoice ${invoice.number} — ${formatINR(note.totalPaise, { decimals: 0 })}`,
    message: `${greeting}\n\nPlease find attached credit note ${note.number} dated ${formatDate(note.noteDate)} for ${formatINR(note.totalPaise)}, against invoice ${invoice.number}. It reduces what is owed on that invoice.${online}\n\nThanks,\n${invoice.from?.signatoryName ?? ''}\n${brand}`,
  }
}

export async function emailCreditNote(ctx: FolioDb & Pick<Ctx, 'memberId'>, input: EmailInput): Promise<EmailResult> {
  const note = await loadCreditNote(ctx, input.id)
  if (note.status !== 'issued') return { ok: false, error: 'A cancelled credit note cannot be emailed.' }
  const invoice = await loadInvoice(ctx, note.invoiceId)
  const pdf = await renderCreditNotePdf(ctx.orgId, note, invoice)
  const outcome = await sendDocumentMail(ctx, {
    kind: 'credit_note',
    clientId: note.clientId,
    recipientIds: input.recipientIds,
    cc: input.cc,
    subject: input.subject,
    message: input.message,
    attachment: { filename: pdfFilename(note.number, 'credit-note'), content: pdf },
    invoiceId: invoice._id,
    entity: 'CreditNote',
    entityId: note._id,
    online: { kind: 'credit_note', docId: note._id },
  })
  if (outcome.error) return { ok: false, error: outcome.error }
  await ctx.db(CreditNote).updateOne({ _id: note._id }, { $set: { lastEmailedAt: new Date() } })
  return { ok: true, message: mailMessage(`Credit note ${note.number}`, outcome), number: note.number, to: outcome.emails.join(', ') }
}
