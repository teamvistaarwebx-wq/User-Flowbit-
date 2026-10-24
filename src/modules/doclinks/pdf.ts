import 'server-only'
import type { Types } from 'mongoose'
import { scoped } from '@/lib/db/scoped'
import { Client } from '@/models/Client'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioEntity } from '@/models/folio/Entity'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Org } from '@/models/Org'
import { renderCreditNotePdf } from '@/components/folio/pdf/CreditNotePdf'
import { pdfFilename, renderInvoicePdf } from '@/components/folio/pdf/InvoicePdf'
import { renderQuotePdf } from '@/components/folio/pdf/QuotePdf'
import { defaultSignatoryOf } from '@/lib/company-profile'
import type { PdfOrg, PdfSignature } from '@/lib/pdf/base'
import { orgPdfCompany, pdfSignature } from '@/lib/pdf/org-branding'
import { folioIssuer } from '@/components/folio/pdf/assets'
import { issuerOf } from '@/modules/folio/invoices/snapshots'
import type { EntityDoc } from '@/modules/folio/context'
import { renderReceiptPdf } from '@/components/folio/pdf/ReceiptPdf'
import { clientLabel, loadProfile } from '@/modules/folio/context'
import { renderStatementPdf } from '@/modules/folio/queries/statement-pdf'
import { RECEIPT_MODE_LABELS, type ReceiptMode } from '@/modules/folio/receipts/rules'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import { isPubliclyVisible } from './access'
import type { LinkDoc } from './links'

/** The PDF behind a public link, rendered with the same renderers as the app; null when the document is not public. */

export type RenderedPdf = { buffer: Buffer; filename: string }

type Scope = { orgId: Types.ObjectId; db: <M extends Parameters<typeof scoped>[0]>(model: M) => ReturnType<typeof scoped<M>> }

async function invoicePdf(scope: Scope, id: Types.ObjectId): Promise<RenderedPdf | null> {
  const invoice = await scope.db(Invoice).findById(id).lean()
  if (!invoice || !isPubliclyVisible({ kind: 'invoice', status: invoice.status, billingType: invoice.billingType })) return null
  const [profile, settings] = await Promise.all([loadProfile(scope, invoice.clientId), getFolioSettings(scope)])
  return { buffer: await renderInvoicePdf(scope.orgId, invoice, { tdsSection: profile?.tds?.section, showTds: settings.invoicing?.showTdsOnInvoice !== false }), filename: pdfFilename(invoice.number, 'invoice') }
}

async function quotePdf(scope: Scope, id: Types.ObjectId): Promise<RenderedPdf | null> {
  const quote = await scope.db(Quote).findById(id).lean()
  if (!quote) return null
  const [entity, client] = await Promise.all([scope.db(FolioEntity).findById(quote.entityId).lean(), scope.db(Client).findById(quote.clientId).lean()])
  if (!entity || !client) return null
  return { buffer: await renderQuotePdf(scope.orgId, quote, entity, client), filename: pdfFilename(quote.number, 'quote') }
}

async function creditNotePdf(scope: Scope, id: Types.ObjectId): Promise<RenderedPdf | null> {
  const note = await scope.db(CreditNote).findById(id).lean()
  if (!note || !isPubliclyVisible({ kind: 'credit_note', status: note.status })) return null
  const invoice = await scope.db(Invoice).findById(note.invoiceId).lean()
  if (!invoice) return null
  return { buffer: await renderCreditNotePdf(scope.orgId, note, invoice), filename: pdfFilename(note.number, 'credit-note') }
}

async function receiptPdf(scope: Scope, id: Types.ObjectId): Promise<RenderedPdf | null> {
  const r = await scope.db(FolioReceipt).findById(id).lean()
  if (!r) return null
  const [entity, client, invoices] = await Promise.all([
    scope.db(FolioEntity).findById(r.entityId).lean(),
    scope.db(Client).findById(r.clientId, { name: 1, displayName: 1 }).lean(),
    scope.db(Invoice).find({ _id: { $in: r.allocations.map((a) => a.invoiceId) } }, { number: 1 }).lean(),
  ])
  const numbers = new Map(invoices.map((i) => [String(i._id), i.number ?? 'Invoice']))
  const head = await receiptIssuer(scope.orgId, entity)
  const buffer = await renderReceiptPdf({
    ...head,
    number: r.number,
    receivedOn: r.receivedOn,
    receivedFrom: client ? clientLabel(client) : '',
    amountPaise: r.amountPaise,
    mode: RECEIPT_MODE_LABELS[r.mode as ReceiptMode] ?? r.mode,
    reference: r.reference ?? null,
    status: r.status,
    allocations: r.allocations.filter((a) => (a.amountPaise ?? 0) > 0).map((a) => ({ invoiceNumber: numbers.get(String(a.invoiceId)) ?? 'Invoice', amountPaise: a.amountPaise ?? 0 })),
  })
  return { buffer, filename: pdfFilename(r.number, 'receipt') }
}

/** The entity's letterhead and signatory (each blank one from the company profile); the company's own without an entity. */
async function receiptIssuer(orgId: Types.ObjectId, entity: EntityDoc | null): Promise<{ issuer: PdfOrg; signature: PdfSignature }> {
  if (entity) return folioIssuer(orgId, issuerOf(entity), { showGstin: entity.kind === 'gst', brandLine: true })
  const company = await orgPdfCompany(orgId)
  const signer = defaultSignatoryOf(company.profile)
  return { issuer: company.letterhead, signature: await pdfSignature(orgId, company.profile.legalName, signer) }
}

async function statementPdf(scope: Scope, clientId: Types.ObjectId): Promise<RenderedPdf | null> {
  const exists = await Org.exists({ _id: scope.orgId })
  if (!exists) return null
  const rendered = await renderStatementPdf(scope, String(clientId), {})
  return rendered ? { buffer: rendered.buffer, filename: rendered.filename } : null
}

export async function renderPublicPdf(link: LinkDoc): Promise<RenderedPdf | null> {
  const scope: Scope = { orgId: link.orgId, db: (model) => scoped(model, link.orgId) }
  switch (link.kind) {
    case 'invoice':
      return invoicePdf(scope, link.docId)
    case 'quote':
      return quotePdf(scope, link.docId)
    case 'credit_note':
      return creditNotePdf(scope, link.docId)
    case 'receipt':
      return receiptPdf(scope, link.docId)
    case 'statement':
      return statementPdf(scope, link.docId)
    default:
      return null
  }
}
