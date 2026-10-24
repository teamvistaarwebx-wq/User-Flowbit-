import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { emailBrandFor } from '@/lib/email-brand'
import { emailLayout, sendMail, type MailKind } from '@/lib/mail'
import { FolioMessage } from '@/models/folio/MessageLog'
import { ensureDocLink } from '@/modules/doclinks/links'
import type { DocKind } from '@/modules/doclinks/token'
import { loadClient, loadProfile, type FolioDb } from './context'

/**
 * Emailing Folio documents to a client. Addresses are never taken from the
 * browser: the form posts recipient ids and they are resolved here against
 * the client's billing recipients (or the client's own contact details).
 */

export type Recipient = { id: string; name: string; email: string; primary: boolean }

/** "View … online: <link>" for the email dialog's default message. */
export async function onlineLine(ctx: FolioDb, kind: DocKind, docId: Types.ObjectId, clientId: Types.ObjectId, verb: string): Promise<string> {
  const link = await ensureDocLink(ctx.orgId, { kind, docId, clientId })
  return `\n\n${verb} online: ${link.url}`
}

/** Who can receive invoices (or reminders) for a client: profile recipients, else the primary contact, else the client email. */
export async function recipientsFor(ctx: FolioDb, clientId: unknown, purpose: 'invoices' | 'reminders' = 'invoices'): Promise<Recipient[]> {
  const [client, profile] = await Promise.all([loadClient(ctx, clientId), loadProfile(ctx, clientId)])
  const fromProfile = (profile?.recipients ?? [])
    .filter((r) => r.email && (purpose === 'invoices' ? r.receivesInvoices : r.receivesReminders))
    .map((r) => ({ id: String(r._id), name: r.name, email: r.email as string, primary: Boolean(r.isPrimary) }))
  if (fromProfile.length) return [...fromProfile].sort((a, b) => Number(b.primary) - Number(a.primary))
  const contact = client.contacts.find((c) => c.primary && c.email) ?? client.contacts.find((c) => c.email)
  if (contact?.email) return [{ id: `contact:${contact._id}`, name: contact.name, email: contact.email, primary: true }]
  return client.email ? [{ id: 'client', name: client.name, email: client.email, primary: true }] : []
}

export type DocumentMail = {
  kind: 'invoice' | 'quote' | 'credit_note'
  clientId: Types.ObjectId
  recipientIds: string[]
  cc?: string
  subject: string
  message: string
  attachment: { filename: string; content: Buffer }
  invoiceId?: Types.ObjectId
  quoteId?: Types.ObjectId
  entity: string
  entityId: Types.ObjectId
  /** The document's public link, added as a "View online" button (notifications-v2 §1.3: links, not only attachments). */
  online?: { kind: DocKind; docId: Types.ObjectId }
}

export type MailOutcome = { delivered: boolean; names: string[]; emails: string[]; error?: string }

const MAIL_KIND: Record<DocumentMail['kind'], MailKind> = { invoice: 'invoice', quote: 'quote', credit_note: 'invoice' }

/** Sends the PDF to the chosen recipients and records it in the client's message log. */
export async function sendDocumentMail(ctx: FolioDb & Pick<Ctx, 'memberId'>, mail: DocumentMail): Promise<MailOutcome> {
  const all = await recipientsFor(ctx, mail.clientId, 'invoices')
  const chosen = all.filter((r) => mail.recipientIds.includes(r.id))
  if (!chosen.length) return { delivered: false, names: [], emails: [], error: 'Pick at least one recipient.' }
  const paragraphs = mail.message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const online = mail.online ? await ensureDocLink(ctx.orgId, { kind: mail.online.kind, docId: mail.online.docId, clientId: mail.clientId, memberId: ctx.memberId }) : null
  const layout = emailLayout({ title: mail.subject, paragraphs, cta: online ? { label: 'View online', href: online.url } : undefined, footer: 'The document is attached as a PDF.', brand: await emailBrandFor(ctx.orgId) })
  const emails = chosen.map((r) => r.email)
  const result = await sendMail({
    to: emails,
    cc: mail.cc || undefined,
    subject: mail.subject,
    html: layout.html,
    text: online && !mail.message.includes(online.url) ? `${mail.message}\n\nView online: ${online.url}` : mail.message,
    attachments: [{ filename: mail.attachment.filename, content: mail.attachment.content, mime: 'application/pdf' }],
    orgId: ctx.orgId,
    kind: MAIL_KIND[mail.kind],
    entity: mail.entity,
    entityId: mail.entityId,
    retry: false,
  })
  const status = !result.ok ? 'failed' : result.provider === 'resend' ? 'sent' : 'logged'
  await ctx.db(FolioMessage).create({
    kind: mail.kind === 'quote' ? 'quote' : 'invoice',
    clientId: mail.clientId,
    invoiceId: mail.invoiceId,
    quoteId: mail.quoteId,
    channel: 'email',
    status,
    offsetDays: null,
    toAddress: emails.join(', '),
    subject: mail.subject,
    body: mail.message,
    outboxId: result.id,
    error: result.error,
    sentAt: result.ok ? new Date() : undefined,
    sentBy: ctx.memberId,
  })
  return { delivered: result.ok && result.provider === 'resend', names: chosen.map((r) => r.name), emails, error: result.ok ? undefined : result.error }
}

/** The toast after a send: delivered, logged (no provider) or failed. */
export function mailMessage(what: string, outcome: MailOutcome): string {
  if (outcome.delivered) return `${what} emailed to ${outcome.names.join(', ')}`
  return `Logged. No email provider is configured, so nothing was delivered to ${outcome.emails.join(', ')}.`
}
