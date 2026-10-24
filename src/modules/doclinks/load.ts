import 'server-only'
import type { Types } from 'mongoose'
import { todayIST } from '@/lib/dates'
import { resolveTheme, workspaceTheme } from '@/lib/brand-theme'
import { scoped } from '@/lib/db/scoped'
import { qrMatrix, qrPath, upiIntent } from '@/lib/upi'
import { Client } from '@/models/Client'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioEntity } from '@/models/folio/Entity'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Org } from '@/models/Org'
import { PaymentLink } from '@/models/payments/PaymentLink'
import { imageSrc } from '@/components/folio/pdf/assets'
import { qtyLabel } from '@/components/folio/pdf/printable'
import { clientLabel, entityLabel } from '@/modules/folio/context'
import { CREDIT_NOTE_REASON_LABELS, type CreditNoteReason } from '@/modules/folio/types'
import { RECEIPT_MODE_LABELS, type ReceiptMode } from '@/modules/folio/receipts/rules'
import { isPayable, isPubliclyVisible, quoteDecision } from './access'
import type { LinkDoc } from './links'
import { publicTotals } from './totals'
import type { PublicBrand, PublicLine, PublicTotal, PublicView, UpiPay } from './view-types'

/**
 * Loads the one document a link points at, through the link's own workspace
 * (scoped db), and shapes it for the public page. Returns null when the
 * document is gone or not public (a draft): the page then says "not found",
 * exactly as for a bad token, so nothing can be probed.
 */

type Db = <M extends Parameters<typeof scoped>[0]>(model: M) => ReturnType<typeof scoped<M>>

type EntityLike = { legalName: string; tradeName?: string | null; address?: { line1?: string | null; line2?: string | null; city?: string | null; pincode?: string | null } | null; addressLines?: string[] | null; city?: string | null; pincode?: string | null; gstin?: string | null; email?: string | null; phone?: string | null; logoFileId?: unknown; bankAccounts?: { upiId?: string | null; isDefault?: boolean | null }[] | null }

/** A billing entity's address (or an issue snapshot's address lines) as display lines. */
export function addressOf(e: Pick<EntityLike, 'address' | 'addressLines' | 'city' | 'pincode'>): string[] {
  if (e.address) return [e.address.line1, e.address.line2, [e.address.city, e.address.pincode].filter(Boolean).join(' ')].filter((l): l is string => Boolean(l))
  return [...(e.addressLines ?? []), [e.city, e.pincode].filter(Boolean).join(' ')].filter(Boolean)
}

export async function brandFor(orgId: Types.ObjectId, entity: EntityLike | null): Promise<PublicBrand> {
  const org = await Org.findById(orgId, { name: 1, logoFileId: 1, theme: 1, subscription: 1, createdAt: 1, status: 1, disabled: 1, deletedAt: 1, enabledProducts: 1, workspaceKind: 1 }).lean()
  const logoSrc = (await imageSrc(orgId, entity?.logoFileId)) ?? (await imageSrc(orgId, org?.logoFileId))
  return {
    name: entity ? entityLabel(entity) : (org?.name ?? 'Your supplier'),
    legalName: entity?.legalName ?? null,
    addressLines: entity ? addressOf(entity) : [],
    gstin: entity?.gstin ?? null,
    email: entity?.email ?? null,
    phone: entity?.phone ?? null,
    logoSrc,
    // The colour the workspace's app shell and PDFs show (lib/brand-theme workspaceTheme).
    color: resolveTheme(org ? workspaceTheme(org) : null).primary,
  }
}

type Priced = { lines: { description: string; quantity: number; unit?: string | null; ratePaise: number; taxablePaise: number }[]; subtotalPaise: number; discountPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; roundOffPaise: number; totalPaise: number; reverseCharge?: boolean | null }

const linesOf = (doc: Priced): PublicLine[] => doc.lines.map((l) => ({ description: l.description, qty: qtyLabel(l.quantity, l.unit ?? 'nos'), ratePaise: l.ratePaise, amountPaise: l.taxablePaise }))

function totalsOf(doc: Priced): PublicTotal[] {
  return publicTotals(doc, { first: { label: 'Subtotal', amountPaise: doc.subtotalPaise }, totalLabel: 'Total' })
}

/** The UPI QR for an invoice's balance, from the invoice's bank snapshot or the entity's default account. */
export function upiFor(vpa: string | null | undefined, payee: string, amountPaise: number, note: string): UpiPay | null {
  if (!vpa) return null
  const intent = upiIntent({ vpa, payee, amountPaise, note })
  if (!intent) return null
  const matrix = qrMatrix(intent)
  return { vpa, payee, intent, qrPath: qrPath(matrix), qrSize: matrix.length }
}

const defaultUpi = (entity: EntityLike | null) => (entity?.bankAccounts ?? []).find((b) => b.isDefault && b.upiId)?.upiId ?? (entity?.bankAccounts ?? []).find((b) => b.upiId)?.upiId ?? null

async function invoiceView(db: Db, orgId: Types.ObjectId, token: string, docId: Types.ObjectId): Promise<PublicView | null> {
  const inv = await db(Invoice).findById(docId).lean()
  if (!inv || !isPubliclyVisible({ kind: 'invoice', status: inv.status, billingType: inv.billingType })) return null
  const entity = (await db(FolioEntity).findById(inv.entityId).lean()) as EntityLike | null
  const brand = await brandFor(orgId, entity ?? (inv.from as EntityLike | null))
  const payable = isPayable(inv)
  const link = payable ? await db(PaymentLink).findOne({ invoiceId: inv._id, status: 'created', amountPaise: inv.balancePaise }).sort({ createdAt: -1 }).lean() : null
  return {
    kind: 'invoice',
    token,
    brand,
    billedTo: inv.billTo?.name ?? '',
    number: inv.number ?? '',
    title: inv.documentType === 'tax_invoice' ? 'Tax invoice' : 'Invoice',
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    lines: linesOf(inv),
    totals: totalsOf(inv),
    totalPaise: inv.totalPaise,
    balancePaise: inv.balancePaise,
    payable,
    payUrl: link?.shortUrl ?? null,
    upi: payable ? upiFor(inv.bank?.upiId || defaultUpi(entity), inv.from?.legalName || brand.name, inv.balancePaise, inv.number ?? '') : null,
    bank: inv.bank?.accountNumber ? { name: inv.bank.bankName ?? '', account: `XXXX${inv.bank.accountNumber.slice(-4)}`, ifsc: inv.bank.ifsc ?? '' } : null,
    notes: inv.notes ?? null,
    terms: inv.terms ?? null,
  }
}

async function quoteView(db: Db, orgId: Types.ObjectId, token: string, docId: Types.ObjectId): Promise<PublicView | null> {
  const q = await db(Quote).findById(docId).lean()
  if (!q) return null
  const [entity, client] = await Promise.all([db(FolioEntity).findById(q.entityId).lean(), db(Client).findById(q.clientId, { name: 1, displayName: 1 }).lean()])
  return {
    kind: 'quote',
    token,
    brand: await brandFor(orgId, entity as EntityLike | null),
    billedTo: client ? clientLabel(client) : '',
    number: q.number,
    title: q.kind === 'proforma' ? 'Proforma invoice' : 'Quotation',
    status: q.status,
    quoteDate: q.quoteDate,
    validUntil: q.validUntil,
    lines: linesOf(q),
    totals: totalsOf(q),
    totalPaise: q.totalPaise,
    decision: quoteDecision(q, todayIST()),
    notes: q.notes ?? null,
    terms: q.terms ?? null,
  }
}

async function creditNoteView(db: Db, orgId: Types.ObjectId, token: string, docId: Types.ObjectId): Promise<PublicView | null> {
  const note = await db(CreditNote).findById(docId).lean()
  if (!note || !isPubliclyVisible({ kind: 'credit_note', status: note.status })) return null
  const [entity, invoice] = await Promise.all([db(FolioEntity).findById(note.entityId).lean(), db(Invoice).findById(note.invoiceId, { number: 1, billTo: 1 }).lean()])
  return {
    kind: 'credit_note',
    token,
    brand: await brandFor(orgId, entity as EntityLike | null),
    billedTo: invoice?.billTo?.name ?? '',
    number: note.number,
    noteDate: note.noteDate,
    invoiceNumber: invoice?.number ?? null,
    reason: CREDIT_NOTE_REASON_LABELS[note.reason as CreditNoteReason] ?? note.reason,
    lines: note.lines.map((l) => ({ description: l.description, qty: '', ratePaise: l.taxablePaise, amountPaise: l.taxablePaise })),
    totals: publicTotals(note, { first: { label: 'Taxable value', amountPaise: note.taxablePaise }, totalLabel: 'Total credit' }),
    totalPaise: note.totalPaise,
  }
}

async function receiptView(db: Db, orgId: Types.ObjectId, token: string, docId: Types.ObjectId): Promise<PublicView | null> {
  const r = await db(FolioReceipt).findById(docId).lean()
  if (!r) return null
  const [entity, client, invoices] = await Promise.all([
    db(FolioEntity).findById(r.entityId).lean(),
    db(Client).findById(r.clientId, { name: 1, displayName: 1 }).lean(),
    db(Invoice).find({ _id: { $in: r.allocations.map((a) => a.invoiceId) } }, { number: 1 }).lean(),
  ])
  const numbers = new Map(invoices.map((i) => [String(i._id), i.number ?? 'Invoice']))
  return {
    kind: 'receipt',
    token,
    brand: await brandFor(orgId, entity as EntityLike | null),
    billedTo: client ? clientLabel(client) : '',
    number: r.number,
    receivedOn: r.receivedOn,
    amountPaise: r.amountPaise,
    mode: RECEIPT_MODE_LABELS[r.mode as ReceiptMode] ?? r.mode,
    reference: r.reference ?? null,
    status: r.status,
    allocations: r.allocations.filter((a) => (a.amountPaise ?? 0) > 0).map((a) => ({ invoiceNumber: numbers.get(String(a.invoiceId)) ?? 'Invoice', amountPaise: a.amountPaise ?? 0 })),
  }
}

async function statementView(db: Db, orgId: Types.ObjectId, token: string, clientId: Types.ObjectId): Promise<PublicView | null> {
  const client = await db(Client).findById(clientId, { name: 1, displayName: 1 }).lean()
  if (!client) return null
  const today = todayIST()
  const open = await db(Invoice).find({ clientId, status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 } }, { number: 1, issueDate: 1, dueDate: 1, totalPaise: 1, balancePaise: 1 }).sort({ dueDate: 1 }).limit(500).lean()
  return {
    kind: 'statement',
    token,
    brand: await brandFor(orgId, null),
    billedTo: clientLabel(client),
    number: `Statement · ${today}`,
    asOf: today,
    totalDuePaise: open.reduce((sum, i) => sum + i.balancePaise, 0),
    invoices: open.map((i) => ({ number: i.number ?? '', issueDate: i.issueDate, dueDate: i.dueDate, totalPaise: i.totalPaise, balancePaise: i.balancePaise, overdue: i.dueDate < today })),
  }
}

/** The page data for an active link, or null when its document is gone or not public. */
export async function loadPublicView(link: LinkDoc, token: string): Promise<PublicView | null> {
  const db: Db = (model) => scoped(model, link.orgId)
  switch (link.kind) {
    case 'invoice':
      return invoiceView(db, link.orgId, token, link.docId)
    case 'quote':
      return quoteView(db, link.orgId, token, link.docId)
    case 'credit_note':
      return creditNoteView(db, link.orgId, token, link.docId)
    case 'receipt':
      return receiptView(db, link.orgId, token, link.docId)
    case 'statement':
      return statementView(db, link.orgId, token, link.docId)
    default:
      return null
  }
}
