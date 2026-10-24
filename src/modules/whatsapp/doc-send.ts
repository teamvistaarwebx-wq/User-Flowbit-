import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import type { Permission } from '@/lib/catalog'
import { formatDate } from '@/lib/dates'
import { appUrl } from '@/lib/env'
import { NotFoundError, UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { firstName } from '@/lib/utils'
import { Client } from '@/models/Client'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioMessage } from '@/models/folio/MessageLog'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { FolioReceipt } from '@/models/folio/Receipt'
import { invoicePaidPayload, quoteAcceptPayload } from '@/modules/actionlinks/token'
import { consoleSettings } from '@/modules/console/settings-query'
import { ensureDocLink, resolveDocLink } from '@/modules/doclinks/links'
import { loadPublicView } from '@/modules/doclinks/load'
import { DOC_KIND_LABELS, type DocKind } from '@/modules/doclinks/token'
import type { PublicView } from '@/modules/doclinks/view-types'
import { recipientsFor } from '@/modules/folio/collections/recipients'
import { messagePricePaise } from '@/modules/wallet/rules'
import { senderConfig } from './connection'
import { buttonSuffix, previewCustomerTemplate, type CustomerTemplateKey } from './customer-templates'
import { normalizePhone } from './phone'
import { sendWorkspaceTemplate } from './workspace-send'

/**
 * "Send on WhatsApp" for Folio documents (invoice, quote/proforma, credit
 * note, receipt, statement): the template filled from the document, its PDF
 * as the document header and its public link as the button, sent from the
 * workspace's own number through `enqueue`. The number is prefilled from the
 * client's billing contacts (WhatsApp, then phone) and normalised to E.164.
 */

export const DOC_TEMPLATE: Readonly<Record<DocKind, CustomerTemplateKey>> = { invoice: 'invoice_share', quote: 'quote_share', credit_note: 'credit_note_share', receipt: 'receipt_thanks', statement: 'statement' }

/** The same rights as emailing the document. */
export const DOC_PERMS: Readonly<Record<DocKind, readonly Permission[]>> = {
  invoice: ['invoices.write', 'invoices.issue'],
  quote: ['quotes.write'],
  credit_note: ['credit_notes.write'],
  receipt: ['receipts.write', 'collections.write'],
  statement: ['collections.write'],
}

/** The client's message log (Folio) row kind; receipts and credit notes stay in the Messages log only. */
const LOG_KIND: Readonly<Record<DocKind, 'invoice' | 'quote' | 'statement' | null>> = { invoice: 'invoice', quote: 'quote', statement: 'statement', receipt: null, credit_note: null }

const ENTITY: Readonly<Record<DocKind, string>> = { invoice: 'Invoice', quote: 'Quote', credit_note: 'CreditNote', receipt: 'FolioReceipt', statement: 'Client' }

type DocCtx = Pick<Ctx, 'orgId' | 'db' | 'memberId' | 'userId'>

/** The client a document belongs to (a statement's id is the client's). */
async function clientOf(ctx: DocCtx, kind: DocKind, id: string): Promise<Types.ObjectId | null> {
  if (kind === 'statement') return (await ctx.db(Client).findById(id, { _id: 1 }).lean())?._id ?? null
  const model = kind === 'invoice' ? Invoice : kind === 'quote' ? Quote : kind === 'credit_note' ? CreditNote : FolioReceipt
  const doc = await ctx.db(model as typeof Invoice).findById(id, { clientId: 1 }).lean()
  return (doc as { clientId?: Types.ObjectId } | null)?.clientId ?? null
}

const amountOf = (view: PublicView): number => {
  switch (view.kind) {
    case 'invoice':
      return view.balancePaise > 0 && view.balancePaise < view.totalPaise ? view.balancePaise : view.totalPaise
    case 'receipt':
      return view.amountPaise
    case 'statement':
      return view.totalDuePaise
    default:
      return view.totalPaise
  }
}

/** The template's values from the public view of the document. */
export function docValues(view: PublicView, recipientName: string | null): Record<string, string> {
  const base = { name: firstName(recipientName || view.billedTo || 'there'), business: view.brand.name, number: view.number, amount: formatINR(amountOf(view), { decimals: 2 }) }
  switch (view.kind) {
    case 'invoice':
      return { ...base, dueDate: formatDate(view.dueDate) }
    case 'quote':
      return { ...base, number: `${view.title.toLowerCase()} ${view.number}`, validUntil: formatDate(view.validUntil) }
    case 'receipt':
      return { ...base, number: view.allocations.map((a) => a.invoiceNumber).join(', ') || `receipt ${view.number}` }
    case 'statement':
      return { ...base, date: formatDate(view.asOf) }
    default:
      return base
  }
}

/** Quick replies a client can press: Accept on a quote, "I've paid" on an invoice (both carry the public link's token). */
export function docPayloads(kind: DocKind, url: string): string[] | undefined {
  const token = url.split('/d/')[1]
  if (!token) return undefined
  if (kind === 'quote') return [quoteAcceptPayload(token)]
  if (kind === 'invoice') return [invoicePaidPayload(token)]
  return undefined
}

export const docFileName = (kind: DocKind, number: string): string => `${DOC_KIND_LABELS[kind].replace(/\s+/g, '-')}-${number.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`.replace(/-+/g, '-')

export type DocWhatsAppDraft = {
  connected: boolean
  template: CustomerTemplateKey
  preview: string
  to: string
  recipients: { id: string; name: string; phone: string }[]
  costText: string
}

async function loadDoc(ctx: DocCtx, kind: DocKind, id: string) {
  const clientId = await clientOf(ctx, kind, id)
  if (!clientId) throw new NotFoundError(`That ${DOC_KIND_LABELS[kind].toLowerCase()}`)
  const link = await ensureDocLink(ctx.orgId, { kind, docId: kind === 'statement' ? clientId : id, clientId, memberId: ctx.memberId })
  const token = link.url.split('/d/')[1] ?? ''
  const resolved = await resolveDocLink(token)
  const view = resolved.state === 'active' ? await loadPublicView(resolved.link, token) : null
  if (!view) throw new UserError(`Only an issued ${DOC_KIND_LABELS[kind].toLowerCase()} can be sent.`)
  return { clientId, url: link.url, view }
}

async function costText(orgId: Types.ObjectId, template: CustomerTemplateKey): Promise<string> {
  const [config, { wallet }] = await Promise.all([senderConfig(orgId), consoleSettings()])
  if (!config) return ''
  const category = config.templates[template].category
  const price = messagePricePaise(config.mode, category, wallet)
  if (config.mode === 'byo') return price ? `${formatINR(price, { decimals: 2 })} from your wallet; Interakt bills Meta’s charge to you.` : 'No Flowbit charge: your Interakt account pays for it.'
  return `${formatINR(price, { decimals: 2 })} + GST from your wallet (${category}).`
}

/** What the dialog shows before sending: the number to use, the filled-in template, the cost. */
export async function docWhatsAppDraft(ctx: DocCtx, kind: DocKind, id: string): Promise<DocWhatsAppDraft> {
  const template = DOC_TEMPLATE[kind]
  const { clientId, view } = await loadDoc(ctx, kind, id)
  const contacts = await recipientsFor(ctx, clientId)
  const recipients = contacts.map((r) => ({ id: r.id, name: r.name, phone: normalizePhone(r.whatsapp ?? r.phone) ?? '' })).filter((r) => r.phone)
  const first = recipients[0] ?? null
  return {
    connected: Boolean(await senderConfig(ctx.orgId)),
    template,
    preview: previewCustomerTemplate(template, docValues(view, first?.name ?? null)),
    to: first?.phone ?? '',
    recipients,
    costText: await costText(ctx.orgId, template),
  }
}

/** Sends the document on WhatsApp to `to` (typed or picked); logs it on the client's message log and the document timeline. */
export async function sendDocOnWhatsApp(ctx: DocCtx, input: { kind: DocKind; id: string; to: string }): Promise<{ ok: boolean; status: string; error?: string; to: string; number: string }> {
  const phone = normalizePhone(input.to)
  if (!phone) throw new UserError('Enter a valid WhatsApp number: a 10-digit Indian mobile, or + country code and number.', { to: 'Not a valid number' })
  const { clientId, url, view } = await loadDoc(ctx, input.kind, input.id)
  const contacts = await recipientsFor(ctx, clientId)
  const known = contacts.find((r) => normalizePhone(r.whatsapp ?? r.phone) === phone)
  const suffix = buttonSuffix(url, appUrl())
  if (!suffix) throw new UserError('The document link could not be made. Check APP_URL.')
  const result = await sendWorkspaceTemplate({
    orgId: ctx.orgId,
    to: phone,
    key: DOC_TEMPLATE[input.kind],
    values: docValues(view, known?.name ?? null),
    extras: { headerUrl: `${url}/pdf`, fileName: docFileName(input.kind, view.number), buttonValue: suffix, payloads: docPayloads(input.kind, url) },
    kind: input.kind === 'receipt' ? 'receipt' : 'invoice',
    event: `folio.${input.kind}_whatsapp`,
    entity: ENTITY[input.kind],
    entityId: input.kind === 'statement' ? clientId : input.id,
    essential: true,
    userId: ctx.userId,
    memberId: ctx.memberId,
    title: `${DOC_KIND_LABELS[input.kind]} ${view.number} on WhatsApp`,
  })
  // Held (empty wallet) or queued for a retry still counts as on its way; the Messages log has the exact state.
  const ok = result.ok || result.status === 'queued'
  const status = ok ? result.status : 'failed'
  const logKind = LOG_KIND[input.kind]
  if (logKind) {
    const body = previewCustomerTemplate(DOC_TEMPLATE[input.kind], docValues(view, known?.name ?? null))
    await ctx.db(FolioMessage).create({ kind: logKind, clientId, invoiceId: input.kind === 'invoice' ? input.id : undefined, quoteId: input.kind === 'quote' ? input.id : undefined, channel: 'whatsapp', status: ok ? 'sent' : 'failed', offsetDays: null, toAddress: phone, body, outboxId: result.id || undefined, error: ok ? undefined : result.error, sentAt: ok ? new Date() : undefined, sentBy: ctx.memberId })
  }
  return { ok, status, error: result.error, to: phone, number: view.number }
}
