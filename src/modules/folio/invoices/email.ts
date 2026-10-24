import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { firstName } from '@/lib/utils'
import { Invoice } from '@/models/folio/Invoice'
import { pdfFilename, renderInvoicePdf } from '@/components/folio/pdf/InvoicePdf'
import { loadProfile, maskAccount, type FolioDb } from '../context'
import { mailMessage, onlineLine, recipientsFor, sendDocumentMail } from '../mail'
import { getFolioSettings } from '../settings/queries'
import { loadInvoice, type InvoiceDoc } from './service'

/** Emailing an issued invoice with its PDF attached. */

export type EmailDefaults = { subject: string; message: string; recipients: { id: string; name: string; email: string; primary: boolean }[] }

/** Prefilled subject and message for the email dialog. */
export async function invoiceEmailDefaults(ctx: FolioDb, invoice: InvoiceDoc): Promise<EmailDefaults> {
  const recipients = await recipientsFor(ctx, invoice.clientId, 'invoices')
  const brand = invoice.from?.tradeName || invoice.from?.legalName || ''
  const period = invoice.periodStart && invoice.periodEnd ? ` It covers ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}.` : ''
  const bank = invoice.bank?.accountNumber ? `\n\nPayment details:\n${invoice.bank.bankName} · A/c ${maskAccount(invoice.bank.accountNumber)} · IFSC ${invoice.bank.ifsc}${invoice.bank.upiId ? ` · UPI ${invoice.bank.upiId}` : ''}` : ''
  const greeting = recipients[0] ? `Hi ${firstName(recipients[0].name)},` : 'Hello,'
  const online = await onlineLine(ctx, 'invoice', invoice._id, invoice.clientId, invoice.status === 'paid' ? 'View' : 'View and pay')
  return {
    recipients,
    subject: `Invoice ${invoice.number} from ${brand} — ${formatINR(invoice.totalPaise, { decimals: 0 })} due ${formatDate(invoice.dueDate)}`,
    message: `${greeting}\n\nPlease find attached invoice ${invoice.number} dated ${formatDate(invoice.issueDate)} for ${formatINR(invoice.totalPaise)}, due on ${formatDate(invoice.dueDate)}.${period}${bank}${online}\n\nThanks,\n${invoice.from?.signatoryName ?? ''}\n${brand}`.replace(/\n\n\n/g, '\n\n'),
  }
}

export type EmailInput = { id: string; recipientIds: string[]; cc?: string; subject: string; message: string }
export type EmailResult = { ok: true; message: string; number: string; to: string } | { ok: false; error: string }

export async function emailInvoice(ctx: FolioDb & Pick<Ctx, 'memberId'>, input: EmailInput): Promise<EmailResult> {
  const invoice = await loadInvoice(ctx, input.id)
  if (!['issued', 'part_paid', 'paid'].includes(invoice.status) || invoice.billingType === 'opening' || !invoice.number) return { ok: false, error: 'Only an issued invoice can be emailed.' }
  const [profile, settings] = await Promise.all([loadProfile(ctx, invoice.clientId), getFolioSettings(ctx)])
  const pdf = await renderInvoicePdf(ctx.orgId, invoice, { tdsSection: profile?.tds?.section, showTds: settings.invoicing?.showTdsOnInvoice !== false })
  const outcome = await sendDocumentMail(ctx, {
    kind: 'invoice',
    clientId: invoice.clientId,
    recipientIds: input.recipientIds,
    cc: input.cc,
    subject: input.subject,
    message: input.message,
    attachment: { filename: pdfFilename(invoice.number, 'invoice'), content: pdf },
    invoiceId: invoice._id,
    entity: 'Invoice',
    entityId: invoice._id,
    online: { kind: 'invoice', docId: invoice._id },
  })
  if (outcome.error) return { ok: false, error: outcome.error }
  await ctx.db(Invoice).updateOne({ _id: invoice._id }, { $set: { lastEmailedAt: new Date() } })
  return { ok: true, message: mailMessage(`Invoice ${invoice.number}`, outcome), number: invoice.number, to: outcome.emails.join(', ') }
}
