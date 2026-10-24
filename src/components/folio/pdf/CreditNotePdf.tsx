import 'server-only'
import type { Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { formatINRForPrint } from '@/lib/money'
import { renderPdf } from '@/lib/pdf/base'
import { footerText } from '@/lib/pdf/footer'
import type { CreditNoteDoc } from '@/modules/folio/credit-notes/service'
import { sgstLabel, stateLabelOf } from '@/modules/folio/engine/states'
import { reverseChargeNote } from '@/modules/folio/invoices/rules'
import type { InvoiceDoc } from '@/modules/folio/invoices/service'
import { CREDIT_NOTE_REASON_LABELS } from '@/modules/folio/types'
import { brandLine, folioIssuer, type IssuerSnapshot, type PartyLike } from './assets'
import { FolioPdf, taxRows, taxSummaryRows, type FolioPdfModel } from './parts'

/** A credit note prints from its invoice's issue snapshots (issuer and billed-to). */
export async function creditNotePdfModel(orgId: Types.ObjectId, note: CreditNoteDoc, invoice: InvoiceDoc): Promise<FolioPdfModel> {
  const from: IssuerSnapshot = invoice.from ?? {}
  const bill: PartyLike = invoice.billTo ?? {}
  const isTax = note.documentType === 'tax_invoice'
  const rcmTax = note.reverseCharge ? note.cgstPaise + note.sgstPaise + note.igstPaise : 0
  const head = await folioIssuer(orgId, from, { showGstin: isTax, brandLine: false })
  return {
    title: 'CREDIT NOTE',
    number: note.number,
    meta: [
      { label: 'Note no.', value: note.number },
      { label: 'Dated', value: formatDate(note.noteDate) },
      { label: 'Against', value: invoice.number ?? '' },
    ],
    issuer: head.issuer,
    legalName: from.legalName ?? '',
    isTax,
    billTo: {
      name: bill.name ?? '',
      addressLines: [...(bill.addressLines ?? []), [bill.city, bill.pincode].filter(Boolean).join(' ')].filter(Boolean),
      extra: [bill.stateCode ? `State: ${stateLabelOf(bill.stateCode)}` : '', isTax && note.clientGstin ? `GSTIN ${note.clientGstin}` : ''].filter(Boolean),
    },
    details: [
      { label: 'Against invoice', value: `${invoice.number} dated ${formatDate(invoice.issueDate)}` },
      { label: 'Reason', value: `${CREDIT_NOTE_REASON_LABELS[note.reason]}: ${note.reasonText}` },
      ...(isTax && note.placeOfSupplyStateCode ? [{ label: 'Place of supply', value: stateLabelOf(note.placeOfSupplyStateCode) }] : []),
    ],
    lines: note.lines.map((l) => ({ description: l.description, hsnSac: l.hsnSac, qty: '1', rate: l.taxablePaise, discountPercent: 0, gstRate: l.gstRatePercent, amount: l.taxablePaise })),
    totals: [
      { label: 'Taxable value', amount: note.taxablePaise },
      ...taxRows(note.lines, sgstLabel(note.placeOfSupplyStateCode)),
      ...(note.roundOffPaise ? [{ label: 'Round off', amount: Math.abs(note.roundOffPaise), negative: note.roundOffPaise < 0 }] : []),
    ],
    totalPaise: note.totalPaise,
    afterTotal: [],
    taxSummary: isTax && note.cgstPaise + note.sgstPaise + note.igstPaise > 0 ? { rows: taxSummaryRows(note.lines), intra: note.supplyType === 'intra_state', sgstLabel: sgstLabel(note.placeOfSupplyStateCode) } : undefined,
    bank: null,
    signatory: head.signature,
    notices: [...(rcmTax > 0 ? [reverseChargeNote(rcmTax, formatINRForPrint)] : []), ...(isTax ? [] : ['Not a tax document. No GST was charged on the invoice.'])],
    footer: footerText([brandLine(from), note.number, isTax ? null : 'Not a tax document'], head.signature),
    watermark: note.status === 'cancelled' ? 'CANCELLED' : undefined,
  }
}

export async function renderCreditNotePdf(orgId: Types.ObjectId, note: CreditNoteDoc, invoice: InvoiceDoc): Promise<Buffer> {
  return renderPdf(<FolioPdf model={await creditNotePdfModel(orgId, note, invoice)} />)
}
