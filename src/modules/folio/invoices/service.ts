import type { ClientSession, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { ForbiddenError, NotFoundError, UserError } from '@/lib/errors'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { termsFor, type FolioDb } from '../context'
import { clientIsRegistered, clientStateCode } from '../engine/gst'
import { dueDateFor } from '../engine/numbering'
import { statusAfterRelease } from '../quotes/rules'
import type { BillingType } from '../types'
import { buildDocument, formContentOf, type BuiltDocument, type DocumentFormBase } from './build'
import { storedPricing } from './pricing'
import { bankOf, billToOf } from './snapshots'

/**
 * Draft invoices: create, edit, delete, duplicate (port of BillingOS
 * `lib/invoice/service.ts`). Issue, void and write-off live in lifecycle.ts.
 */

/** A member ctx, or a system ctx (cron) without a member. */
export type ServiceCtx = FolioDb & { memberId?: Types.ObjectId }

export type DraftSpec = DocumentFormBase & {
  issueDate: string
  paymentTermsDays?: number | null
  billingType?: BillingType
  subject?: string
  purchaseOrderRef?: string
  bankAccountId?: string
  reverseCharge?: boolean
  periodStart?: string | null
  periodEnd?: string | null
  notes?: string
  terms?: string
  internalNotes?: string
  retainerId?: Types.ObjectId | string | null
  retainerBillingDate?: string | null
  planId?: Types.ObjectId | string | null
  milestoneId?: Types.ObjectId | string | null
  quoteId?: Types.ObjectId | string | null
  dealId?: Types.ObjectId | string | null
}

/** The stored fields of a draft, from a priced document and the form. */
function draftFields(built: BuiltDocument, spec: DraftSpec) {
  const { entity, client, profile, priced } = built
  const isTax = priced.documentType === 'tax_invoice'
  if (spec.reverseCharge && (!isTax || !clientIsRegistered(client))) {
    throw new UserError('Some fields need attention.', { reverseCharge: 'Reverse charge needs a tax invoice and a client with a GSTIN' })
  }
  const terms = termsFor(spec.paymentTermsDays, profile, entity)
  const bank = bankOf(entity, spec.bankAccountId)
  return {
    clientId: client._id,
    entityId: entity._id,
    ...storedPricing(priced),
    clientStateCodeAtSave: clientStateCode(client, profile),
    issueDate: spec.issueDate,
    dueDate: dueDateFor(spec.issueDate, terms),
    paymentTermsDays: terms,
    billingType: spec.billingType ?? 'one_time',
    periodStart: spec.periodStart ?? null,
    periodEnd: spec.periodEnd ?? null,
    clientGstin: isTax ? (client.gstin ?? null) : null,
    entityGstin: isTax ? (entity.gstin ?? null) : null,
    reverseCharge: isTax && Boolean(spec.reverseCharge),
    billTo: billToOf(client),
    bankAccountId: bank.bankAccountId,
    tdsPercent: priced.tdsPercent,
    tdsPaise: priced.tdsPaise,
    subject: spec.subject,
    purchaseOrderRef: spec.purchaseOrderRef,
    notes: spec.notes ?? entity.defaults?.notes ?? undefined,
    terms: spec.terms ?? entity.defaults?.terms ?? undefined,
    internalNotes: spec.internalNotes,
  }
}

const links = (spec: DraftSpec) => ({
  retainerId: spec.retainerId ?? null,
  retainerBillingDate: spec.retainerBillingDate ?? null,
  planId: spec.planId ?? null,
  milestoneId: spec.milestoneId ?? null,
  quoteId: spec.quoteId ?? null,
  dealId: spec.dealId ?? null,
})

export type CreatedDraft = { id: Types.ObjectId; clientName: string; totalPaise: number }

export async function createDraftInvoice(ctx: ServiceCtx, spec: DraftSpec, session?: ClientSession): Promise<CreatedDraft> {
  const built = await buildDocument(ctx, spec, { reverseCharge: spec.reverseCharge })
  const invoice = await ctx.db(Invoice).create({ ...draftFields(built, spec), ...links(spec), status: 'draft', number: null, balancePaise: 0, createdBy: ctx.memberId }, session ? { session } : undefined)
  return { id: invoice._id, clientName: built.client.name, totalPaise: invoice.totalPaise }
}

export async function loadInvoice(ctx: FolioDb, id: unknown, session?: ClientSession) {
  const invoice = await ctx.db(Invoice).findById(id, null, { session }).lean()
  if (!invoice) throw new NotFoundError('That invoice')
  return invoice
}

export type InvoiceDoc = Awaited<ReturnType<typeof loadInvoice>>

/** Replaces everything on a draft; links (retainer, plan, quote, deal) are kept. */
export async function updateDraftInvoice(ctx: ServiceCtx, id: string, spec: DraftSpec): Promise<CreatedDraft> {
  const current = await loadInvoice(ctx, id)
  if (current.status !== 'draft') throw new UserError('Only a draft can be edited. Raise a credit note instead.')
  if (current.billingType === 'opening') throw new UserError('The opening balance is edited on the client’s billing profile.')
  const built = await buildDocument(ctx, spec, { reverseCharge: spec.reverseCharge })
  const fields = draftFields(built, { ...spec, billingType: spec.billingType ?? (current.billingType as BillingType) })
  const res = await ctx.db(Invoice).updateOne({ _id: current._id, status: 'draft' }, { $set: fields })
  if (!res.matchedCount) throw new UserError('That invoice was issued a moment ago, so it can no longer be edited.')
  return { id: current._id, clientName: built.client.name, totalPaise: fields.totalPaise }
}

/** Releases what a draft or a voided invoice held: its plan phase and its quote. */
export async function releaseLinks(ctx: FolioDb, invoice: Pick<InvoiceDoc, '_id' | 'planId' | 'milestoneId' | 'quoteId'>, session?: ClientSession): Promise<void> {
  if (invoice.planId && invoice.milestoneId) {
    await ctx.db(FolioBillingPlan).updateOne(
      { _id: invoice.planId, 'milestones._id': invoice.milestoneId },
      { $set: { 'milestones.$.status': 'pending', 'milestones.$.invoiceId': null } },
      { session },
    )
  }
  if (invoice.quoteId) {
    const filter = { _id: invoice.quoteId, convertedInvoiceId: invoice._id }
    const quote = await ctx.db(Quote).findOne(filter, { statusBeforeConvert: 1, acceptedAt: 1, sentAt: 1 }, { session }).lean()
    if (quote) await ctx.db(Quote).updateOne(filter, { $set: { status: statusAfterRelease(quote), convertedInvoiceId: null, statusBeforeConvert: null } }, { session })
  }
}

/** Deletes a draft (it holds no number). Issue permission, or write permission on your own draft. */
export async function deleteDraftInvoice(ctx: ServiceCtx & Pick<Ctx, 'can'>, id: string): Promise<InvoiceDoc> {
  const invoice = await loadInvoice(ctx, id)
  if (invoice.status !== 'draft') throw new UserError('Only a draft invoice can be deleted.')
  const own = String(invoice.createdBy ?? '') === String(ctx.memberId)
  if (!ctx.can('invoices.issue') && !(ctx.can('invoices.write') && own)) throw new ForbiddenError('Only the person who created this draft, or someone who can issue invoices, can delete it.')
  const res = await ctx.db(Invoice).deleteOne({ _id: invoice._id, status: 'draft' })
  if (!res.deletedCount) throw new UserError('That invoice was issued a moment ago, so it can no longer be deleted.')
  await releaseLinks(ctx, invoice)
  return invoice
}

/** A spec that rebuilds an existing invoice's content (for duplicate and edit forms). */
export function specFromInvoice(invoice: InvoiceDoc, overrides: Partial<DraftSpec> = {}): DraftSpec {
  return {
    entityId: String(invoice.entityId),
    clientId: String(invoice.clientId),
    ...formContentOf(invoice),
    issueDate: invoice.issueDate,
    paymentTermsDays: invoice.paymentTermsDays,
    billingType: invoice.billingType === 'opening' ? 'one_time' : (invoice.billingType as BillingType),
    subject: invoice.subject ?? undefined,
    purchaseOrderRef: invoice.purchaseOrderRef ?? undefined,
    reverseCharge: invoice.reverseCharge,
    notes: invoice.notes ?? undefined,
    terms: invoice.terms ?? undefined,
    ...overrides,
  }
}

/** A new draft with the same entity, client, lines, discount and notes, dated today. */
export async function duplicateInvoice(ctx: ServiceCtx, id: string): Promise<CreatedDraft> {
  const invoice = await loadInvoice(ctx, id)
  if (invoice.billingType === 'opening') throw new UserError('The opening balance cannot be duplicated.')
  return createDraftInvoice(ctx, specFromInvoice(invoice, { issueDate: todayIST(), billingType: 'one_time', periodStart: null, periodEnd: null, paymentTermsDays: null }))
}
