import type { ClientSession } from 'mongoose'
import { formatDate, todayIST } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { loadClient, loadEntity, loadProfile, type EntityDoc, type FolioDb } from '../context'
import { takeNumber } from '../counter'
import { clientStateCode, isTaxable, isValidGstin } from '../engine/gst'
import { dueDateFor, financialYearOf } from '../engine/numbering'
import { recalcInvoiceSettlement } from '../settlement'
import { withTxn } from '../txn'
import { cancelWindowOpen } from '../einvoice/payload'
import { activeEinvoice } from '../einvoice/service'
import { placeOfSupplyIsStale } from './place-of-supply'
import { irnVoidRefusal } from './rules'
import { loadInvoice, releaseLinks, type InvoiceDoc, type ServiceCtx } from './service'
import { bankOf, billToOf, issuerOf } from './snapshots'

/**
 * The invoice state machine after the draft: issue (number + snapshots +
 * status in one transaction), void, write-off and its undo.
 */

/** The date of the latest issued invoice in the entity+FY series that `date` falls in, if any. */
async function latestSeriesDate(ctx: FolioDb, entityId: EntityDoc['_id'], date: string, session?: ClientSession): Promise<string | null> {
  const latest = await ctx.db(Invoice).findOne({ entityId, fyLabel: financialYearOf(date), status: { $ne: 'draft' }, billingType: { $ne: 'opening' } }, { issueDate: 1 }, session ? { session } : {}).sort({ issueDate: -1 }).lean()
  return latest?.issueDate ?? null
}

/** The date the Issue dialog should offer: the draft's own date, moved up to the series' latest date when it is older (catch-up drafts). */
export async function issuableDate(ctx: FolioDb, invoice: Pick<InvoiceDoc, 'entityId' | 'issueDate'>): Promise<string> {
  const latest = await latestSeriesDate(ctx, invoice.entityId, invoice.issueDate)
  return latest && latest > invoice.issueDate ? latest : invoice.issueDate
}

/** Refuses a future date, and a date before the latest issued invoice in the same entity+FY series. */
async function assertSeriesDate(ctx: FolioDb, entity: EntityDoc, issueDate: string, session: ClientSession): Promise<void> {
  if (issueDate > todayIST()) throw new UserError('Invoices cannot be dated in the future.', { issueDate: 'Pick today or an earlier date' })
  const latest = await latestSeriesDate(ctx, entity._id, issueDate, session)
  if (latest && latest > issueDate) {
    throw new UserError(`${entity.code}'s last invoice is dated ${formatDate(latest)}. Date this one on or after it, so the series stays in order.`, { issueDate: `On or after ${formatDate(latest)}` })
  }
}

/** The chosen bank if it still exists on the entity, else the entity's default. */
function bankAtIssue(entity: EntityDoc, bankAccountId: unknown) {
  const id = bankAccountId ? String(bankAccountId) : null
  const exists = id && entity.bankAccounts.some((a) => String(a._id) === id)
  return bankOf(entity, exists ? id : null)
}

export type IssueResult = { number: string; totalPaise: number; clientName: string; invoice: InvoiceDoc }

export async function issueInvoice(ctx: ServiceCtx, id: string, opts: { issueDate?: string } = {}): Promise<IssueResult> {
  return withTxn(async (session) => {
    const invoice = await loadInvoice(ctx, id, session)
    if (invoice.status !== 'draft') throw new UserError('That invoice has already been issued.')
    if (!invoice.lines.length) throw new UserError('An invoice needs at least one line.')
    if (!(invoice.totalPaise > 0)) throw new UserError('An invoice must be for more than zero.')
    const issueDate = opts.issueDate ?? invoice.issueDate
    const entity = await loadEntity(ctx, invoice.entityId, { active: true })
    const client = await loadClient(ctx, invoice.clientId)
    await assertSeriesDate(ctx, entity, issueDate, session)
    const isTax = invoice.documentType === 'tax_invoice'
    if (isTax && client.gstin && !isValidGstin(client.gstin)) throw new UserError(`${client.name}'s GSTIN is not valid. Fix it on the client before issuing a tax invoice.`)
    if (isTax && isTaxable(invoice.supplyType) && !invoice.placeOfSupplyStateCode) {
      throw new UserError(`A tax invoice must show its place of supply. Add ${client.name}'s state on the client, or pick the place of supply on the draft and save it, then issue it.`)
    }
    if (isTax && invoice.reverseCharge && !client.gstin) throw new UserError('Reverse charge needs the client’s GSTIN. Add it on the client, or untick reverse charge.')
    // The tax split (CGST+SGST or IGST) was worked out when the draft was saved; if either GSTIN changed since, it may be wrong.
    const gstinChanged = (stored: string | null | undefined, current: string | null | undefined) => (stored ?? '') !== (current ?? '')
    if (isTax && (gstinChanged(invoice.clientGstin, client.gstin) || gstinChanged(invoice.entityGstin, entity.gstin))) {
      throw new UserError('The client’s or your GSTIN changed after this draft was saved, so its tax may be wrong. Open the draft and save it again, then issue it.')
    }
    const profile = isTax ? await loadProfile(ctx, client._id) : null
    const stale = placeOfSupplyIsStale({ isTax, supplyType: invoice.supplyType, placeOfSupplyStateCode: invoice.placeOfSupplyStateCode, clientStateCodeAtSave: invoice.clientStateCodeAtSave, clientStateCodeNow: clientStateCode(client, profile) })
    if (stale) throw new UserError(`${client.name}'s state or place of supply changed after this draft was saved, so its tax split may be wrong. Open the draft and save it again, then issue it.`)
    const taken = await takeNumber(ctx.orgId, entity, 'invoice', issueDate, session)
    const bank = bankAtIssue(entity, invoice.bankAccountId)
    const res = await ctx.db(Invoice).updateOne(
      { _id: invoice._id, status: 'draft' },
      {
        $set: {
          number: taken.number, fyLabel: taken.fyLabel, seq: taken.seq, status: 'issued', issuedAt: new Date(), issuedBy: ctx.memberId,
          issueDate, dueDate: dueDateFor(issueDate, invoice.paymentTermsDays), balancePaise: invoice.totalPaise,
          from: issuerOf(entity), bankAccountId: bank.bankAccountId, bank: bank.bank, billTo: billToOf(client), clientGstin: isTax ? (client.gstin ?? null) : null,
        },
      },
      { session },
    )
    if (!res.matchedCount) throw new UserError('That invoice has already been issued.')
    if (invoice.planId && invoice.milestoneId) {
      await ctx.db(FolioBillingPlan).updateOne({ _id: invoice.planId, 'milestones._id': invoice.milestoneId }, { $set: { 'milestones.$.status': 'invoiced', 'milestones.$.invoiceId': invoice._id } }, { session })
    }
    if (invoice.quoteId) await ctx.db(Quote).updateOne({ _id: invoice.quoteId }, { $set: { status: 'converted', convertedInvoiceId: invoice._id } }, { session })
    return { number: taken.number, totalPaise: invoice.totalPaise, clientName: client.name, invoice }
  })
}

export async function voidInvoice(ctx: ServiceCtx, id: string, reason: string): Promise<InvoiceDoc> {
  if (!reason.trim()) throw new UserError('A void needs a reason on the record.')
  return withTxn(async (session) => {
    const invoice = await loadInvoice(ctx, id, session)
    if (invoice.status === 'draft') throw new UserError('Delete the draft instead.')
    if (invoice.status === 'void') throw new UserError('That invoice is already void.')
    if (invoice.billingType === 'opening') throw new UserError('Set the opening balance to zero on the billing profile instead.')
    if (invoice.writtenOffPaise > 0) throw new UserError('This invoice is written off. Undo the write-off first, then void it.')
    const irn = await activeEinvoice(ctx, invoice._id)
    const irnRefusal = irnVoidRefusal(irn ? cancelWindowOpen(irn.ackDate, new Date()) : null)
    if (irnRefusal) throw new UserError(irnRefusal)
    const recalc = await recalcInvoiceSettlement(ctx, invoice._id, session)
    if (recalc.paid + recalc.tds + recalc.credited > 0) {
      throw new UserError('Money or a credit note is already applied to this invoice. Release the payment or cancel the credit note first, or raise a credit note instead.')
    }
    await ctx.db(Invoice).updateOne({ _id: invoice._id }, { $set: { status: 'void', voidedAt: new Date(), voidedBy: ctx.memberId, voidReason: reason.trim(), balancePaise: 0 } }, { session })
    await releaseLinks(ctx, invoice, session)
    return invoice
  })
}

export async function writeOffInvoice(ctx: ServiceCtx, id: string, reason: string): Promise<{ invoice: InvoiceDoc; amountPaise: number }> {
  if (!reason.trim()) throw new UserError('A write-off needs a reason on the record.')
  return withTxn(async (session) => {
    const invoice = await loadInvoice(ctx, id, session)
    const current = await recalcInvoiceSettlement(ctx, invoice._id, session)
    if (!['issued', 'part_paid'].includes(current.status) || current.balance <= 0) throw new UserError('Only an issued or part-paid invoice with a balance can be written off.')
    await ctx.db(Invoice).updateOne({ _id: invoice._id }, { $set: { writtenOffPaise: current.balance, writtenOffAt: new Date(), writtenOffBy: ctx.memberId, writeOffReason: reason.trim() } }, { session })
    await recalcInvoiceSettlement(ctx, invoice._id, session)
    return { invoice, amountPaise: current.balance }
  })
}

export async function undoWriteOff(ctx: ServiceCtx, id: string): Promise<InvoiceDoc> {
  return withTxn(async (session) => {
    const invoice = await loadInvoice(ctx, id, session)
    if (!(invoice.writtenOffPaise > 0)) throw new UserError('That invoice is not written off.')
    if (invoice.status === 'void') throw new UserError('That invoice is void, so its write-off cannot be undone.')
    await ctx.db(Invoice).updateOne({ _id: invoice._id }, { $set: { writtenOffPaise: 0, writtenOffAt: null, writtenOffBy: null, writeOffReason: null } }, { session })
    await recalcInvoiceSettlement(ctx, invoice._id, session)
    return invoice
  })
}
