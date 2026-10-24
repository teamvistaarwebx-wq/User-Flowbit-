import type { ClientSession, Types } from 'mongoose'
import { formatDate, todayIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { CreditNote } from '@/models/folio/CreditNote'
import { loadEntity, type FolioDb } from '../context'
import { takeNumber } from '../counter'
import { toPaise } from '../engine/money'
import { computeInvoice } from '../engine/totals'
import { loadInvoice, type InvoiceDoc, type ServiceCtx } from '../invoices/service'
import { getFolioSettings } from '../settings/queries'
import { creditRoundsTotal, fitFullCredit, section34Warning } from './rules'
import { outstandingFor, recalcInvoiceSettlement } from '../settlement'
import { withTxn } from '../txn'
import type { CreditNoteReason } from '../types'

/**
 * Credit notes: the only way to reduce an issued invoice. Issued on creation,
 * against one invoice, never more than that invoice still has outstanding
 * (refunds are modelled as release-then-credit).
 */

export async function loadCreditNote(ctx: FolioDb, id: unknown) {
  const note = await ctx.db(CreditNote).findById(id).lean()
  if (!note) throw new NotFoundError('That credit note')
  return note
}

export type CreditNoteDoc = Awaited<ReturnType<typeof loadCreditNote>>

/** Σ taxable already credited per invoice line, over issued credit notes. */
export async function creditedByLine(ctx: FolioDb, invoiceId: Types.ObjectId, session?: ClientSession): Promise<Map<string, number>> {
  const rows = await ctx.db(CreditNote).aggregate<{ _id: Types.ObjectId; taxable: number }>(
    [{ $match: { invoiceId, status: 'issued' } }, { $unwind: '$lines' }, { $group: { _id: '$lines.invoiceLineId', taxable: { $sum: '$lines.taxablePaise' } } }],
    session ? { session } : {},
  )
  return new Map(rows.map((r) => [String(r._id), r.taxable]))
}

export type CreditNoteInput = {
  invoiceId: string
  noteDate: string
  reason: CreditNoteReason
  reasonText: string
  mode: 'full' | 'lines'
  lines: { invoiceLineId: string; taxable?: number }[]
}

function creditAmounts(invoice: InvoiceDoc, credited: Map<string, number>, input: CreditNoteInput) {
  const fieldErrors: Record<string, string> = {}
  const amounts = invoice.lines.map((line, i) => {
    const left = line.taxablePaise - (credited.get(String(line._id)) ?? 0)
    if (input.mode === 'full') return { line, credit: Math.max(0, left) }
    const asked = input.lines.find((l) => l.invoiceLineId === String(line._id))?.taxable ?? 0
    const credit = toPaise(asked)
    if (credit > left) fieldErrors[`lines.${i}.taxable`] = `Line ${i + 1} has only ${formatINR(Math.max(0, left))} left to credit.`
    return { line, credit }
  })
  if (Object.keys(fieldErrors).length) throw new UserError('Some lines ask for more than they have left to credit.', fieldErrors)
  const picked = amounts.filter((a) => a.credit > 0)
  if (!picked.length) throw new UserError(input.mode === 'full' ? 'Everything on this invoice has already been credited.' : 'Enter an amount to credit on at least one line.')
  return picked
}

export async function createCreditNote(ctx: ServiceCtx, input: CreditNoteInput): Promise<{ id: Types.ObjectId; number: string; invoiceNumber: string; warning: string | null }> {
  const settings = await getFolioSettings(ctx)
  return withTxn(async (session) => {
    const invoice = await loadInvoice(ctx, input.invoiceId, session)
    if (!['issued', 'part_paid', 'paid'].includes(invoice.status) || invoice.billingType === 'opening') throw new UserError('Credit notes can only be raised against an issued invoice.')
    if (input.noteDate < invoice.issueDate) throw new UserError(`The note cannot be dated before the invoice (${formatDate(invoice.issueDate)}).`, { noteDate: `On or after ${formatDate(invoice.issueDate)}` })
    if (input.noteDate > todayIST()) throw new UserError('Credit notes cannot be dated in the future.', { noteDate: 'Pick today or an earlier date' })
    const picked = creditAmounts(invoice, await creditedByLine(ctx, invoice._id, session), input)
    const computed = computeInvoice({
      lines: picked.map((p) => ({ description: p.line.description, quantity: 1, rate: p.credit, gstRatePercent: p.line.gstRatePercent })),
      supplyType: invoice.supplyType,
      reverseCharge: Boolean(invoice.reverseCharge),
      roundOffTotal: creditRoundsTotal(invoice, settings.invoicing?.roundOffTotal !== false),
    })
    const open = await outstandingFor(ctx, invoice._id, session)
    const priced = input.mode === 'full' ? fitFullCredit(computed, open.outstanding) : computed
    if (priced.total > open.outstanding) {
      throw new UserError(`${invoice.number} has only ${formatINR(Math.max(0, open.outstanding))} outstanding. Release a payment from it first if the client needs a refund.`)
    }
    const entity = await loadEntity(ctx, invoice.entityId)
    const taken = await takeNumber(ctx.orgId, entity, 'credit_note', input.noteDate, session)
    const note = await ctx.db(CreditNote).create(
      {
        ...taken,
        entityId: invoice.entityId,
        clientId: invoice.clientId,
        invoiceId: invoice._id,
        documentType: invoice.documentType,
        status: 'issued',
        noteDate: input.noteDate,
        reason: input.reason,
        reasonText: input.reasonText,
        supplyType: invoice.supplyType,
        placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
        clientGstin: invoice.clientGstin,
        entityGstin: invoice.entityGstin,
        reverseCharge: Boolean(invoice.reverseCharge),
        lines: picked.map((p, i) => {
          const c = priced.lines[i]
          return { invoiceLineId: p.line._id, description: p.line.description, hsnSac: p.line.hsnSac, taxablePaise: c.taxableValue, gstRatePercent: c.gstRatePercent, cgstPaise: c.cgstAmount, sgstPaise: c.sgstAmount, igstPaise: c.igstAmount, lineTotalPaise: c.lineTotal }
        }),
        taxablePaise: priced.taxableValue,
        cgstPaise: priced.cgstAmount,
        sgstPaise: priced.sgstAmount,
        igstPaise: priced.igstAmount,
        roundOffPaise: priced.roundOff,
        totalPaise: priced.total,
        issuedAt: new Date(),
        issuedBy: ctx.memberId,
      },
      { session },
    )
    await recalcInvoiceSettlement(ctx, invoice._id, session)
    return { id: note._id, number: note.number, invoiceNumber: invoice.number ?? '', warning: section34Warning(invoice.issueDate, input.noteDate, formatDate) }
  })
}

export async function cancelCreditNote(ctx: ServiceCtx, id: string, reason: string): Promise<CreditNoteDoc> {
  if (!reason.trim()) throw new UserError('A cancellation needs a reason on the record.')
  return withTxn(async (session) => {
    const note = await ctx.db(CreditNote).findById(id, null, { session }).lean()
    if (!note) throw new NotFoundError('That credit note')
    if (note.status !== 'issued') throw new UserError('That credit note is already cancelled.')
    await ctx.db(CreditNote).updateOne({ _id: note._id }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: ctx.memberId, cancelReason: reason.trim() } }, { session })
    await recalcInvoiceSettlement(ctx, note.invoiceId, session)
    return note
  })
}
