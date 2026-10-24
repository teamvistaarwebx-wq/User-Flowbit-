import 'server-only'
import type { Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { formatINRForPrint } from '@/lib/money'
import { renderPdf } from '@/lib/pdf/base'
import { footerText } from '@/lib/pdf/footer'
import { qrMatrix, qrPath, upiIntent } from '@/lib/upi'
import { SUPPLY_TYPE_LABELS } from '@/modules/folio/engine/gst'
import { sgstLabel, stateLabelOf } from '@/modules/folio/engine/states'
import { reverseChargeNote } from '@/modules/folio/invoices/rules'
import type { InvoiceDoc } from '@/modules/folio/invoices/service'
import { brandLine, folioIssuer, type IssuerSnapshot, type PartyLike } from './assets'
import { EInvoice } from '@/models/folio/EInvoice'
import { FolioPdf, qtyLabel, taxRows, taxSummaryRows, type FolioPdfModel, type PdfTotalRow } from './parts'

export const EXPORT_NOTE = 'Supply meant for export / to SEZ under LUT without payment of IGST.'

/** Subtotal → Discount → Taxable value → tax → round off (never a double discount). */
export function pricingRows(doc: { subtotalPaise: number; discountPaise: number; taxablePaise: number; roundOffPaise: number; lines: { gstRatePercent: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[] }, placeCode: string | null | undefined): PdfTotalRow[] {
  return [
    { label: 'Subtotal', amount: doc.subtotalPaise },
    ...(doc.discountPaise ? [{ label: 'Discount', amount: doc.discountPaise, negative: true }] : []),
    { label: 'Taxable value', amount: doc.taxablePaise },
    ...taxRows(doc.lines, sgstLabel(placeCode)),
    ...(doc.roundOffPaise ? [{ label: 'Round off', amount: Math.abs(doc.roundOffPaise), negative: doc.roundOffPaise < 0 }] : []),
  ]
}

/** The UPI QR for what is still owed (none once paid, or without a UPI ID on the invoice's bank snapshot). */
function upiQrFor(invoice: InvoiceDoc): FolioPdfModel['upiQr'] {
  const vpa = invoice.bank?.upiId
  if (!vpa || !['issued', 'part_paid'].includes(invoice.status) || invoice.balancePaise <= 0) return null
  const intent = upiIntent({ vpa, payee: invoice.from?.legalName || invoice.from?.tradeName || 'Payee', amountPaise: invoice.balancePaise, note: invoice.number ?? '' })
  if (!intent) return null
  const matrix = qrMatrix(intent)
  return { path: qrPath(matrix), size: matrix.length, caption: `Scan to pay ${formatINRForPrint(invoice.balancePaise)} by UPI` }
}

type Extras = { tdsSection?: string | null; showTds: boolean }

/** The active IRN's print block: the IRP's signed QR string encoded as a QR (as the rules require). */
async function einvoiceFor(orgId: Types.ObjectId, invoice: InvoiceDoc): Promise<FolioPdfModel['einvoice']> {
  if (invoice.documentType !== 'tax_invoice' || invoice.status === 'draft') return null
  const einv = await EInvoice.findOne({ orgId, invoiceId: invoice._id, status: 'active' }, { irn: 1, ackNo: 1, ackDate: 1, signedQr: 1, ewb: 1 }).lean()
  if (!einv) return null
  const matrix = qrMatrix(einv.signedQr)
  return { irn: einv.irn, ackNo: einv.ackNo, ackDate: einv.ackDate, qr: { path: qrPath(matrix), size: matrix.length }, ewbNo: einv.ewb?.ewbNo ?? null, ewbValidTill: einv.ewb?.validTill ?? null }
}

export async function invoicePdfModel(orgId: Types.ObjectId, invoice: InvoiceDoc, extras: Extras): Promise<FolioPdfModel> {
  const from: IssuerSnapshot = invoice.from ?? {}
  const isTax = invoice.documentType === 'tax_invoice'
  const number = invoice.number ?? 'DRAFT'
  const zeroRated = invoice.supplyType === 'export' || invoice.supplyType === 'sez'
  const bill: PartyLike = invoice.billTo ?? {}
  const rcmTax = invoice.reverseCharge ? invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise : 0
  const head = await folioIssuer(orgId, from, { showGstin: isTax, brandLine: false })
  return {
    title: isTax ? 'TAX INVOICE' : 'INVOICE',
    number,
    meta: [
      { label: 'Invoice no.', value: number },
      { label: 'Dated', value: formatDate(invoice.issueDate) },
      { label: 'Due', value: formatDate(invoice.dueDate) },
      ...(invoice.purchaseOrderRef ? [{ label: 'Your PO', value: invoice.purchaseOrderRef }] : []),
      ...(isTax ? [{ label: 'Copy', value: 'Original for recipient' }] : []),
    ],
    issuer: head.issuer,
    legalName: from.legalName ?? '',
    isTax,
    billTo: {
      name: bill.name ?? '',
      addressLines: [...(bill.addressLines ?? []), [bill.city, bill.pincode].filter(Boolean).join(' ')].filter(Boolean),
      extra: [bill.stateCode ? `State: ${stateLabelOf(bill.stateCode)}` : '', isTax && bill.gstin ? `GSTIN ${bill.gstin}` : ''].filter(Boolean),
    },
    details: [
      ...(invoice.subject ? [{ label: 'For', value: invoice.subject }] : []),
      ...(invoice.periodStart && invoice.periodEnd ? [{ label: 'Service period', value: `${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}` }] : []),
      ...(isTax && invoice.placeOfSupplyStateCode ? [{ label: 'Place of supply', value: stateLabelOf(invoice.placeOfSupplyStateCode) }] : []),
      ...(isTax ? [{ label: 'Reverse charge', value: invoice.reverseCharge ? 'Yes' : 'No' }] : []),
      ...(isTax && zeroRated ? [{ label: 'Supply', value: SUPPLY_TYPE_LABELS[invoice.supplyType] }] : []),
    ],
    lines: invoice.lines.map((l) => ({ description: l.description, hsnSac: l.hsnSac, qty: qtyLabel(l.quantity, l.unit), rate: l.ratePaise, discountPercent: l.discountPercent, gstRate: l.gstRatePercent, amount: l.taxablePaise })),
    totals: pricingRows(invoice, invoice.placeOfSupplyStateCode),
    totalPaise: invoice.totalPaise,
    afterTotal:
      extras.showTds && invoice.tdsPaise > 0
        ? [
            { label: `Less: TDS @ ${invoice.tdsPercent}%${extras.tdsSection ? ` (${extras.tdsSection})` : ''}`, amount: invoice.tdsPaise, negative: true },
            { label: 'Net payable', amount: invoice.totalPaise - invoice.tdsPaise },
          ]
        : [],
    taxSummary: isTax && invoice.taxablePaise > 0 && !zeroRated ? { rows: taxSummaryRows(invoice.lines), intra: invoice.supplyType === 'intra_state', sgstLabel: sgstLabel(invoice.placeOfSupplyStateCode) } : undefined,
    upiQr: upiQrFor(invoice),
    einvoice: await einvoiceFor(orgId, invoice),
    bank: invoice.bank?.accountNumber ? { accountName: invoice.bank.accountName ?? '', bankName: invoice.bank.bankName ?? '', branch: invoice.bank.branch, accountNumber: invoice.bank.accountNumber, ifsc: invoice.bank.ifsc ?? '', upiId: invoice.bank.upiId } : null,
    terms: invoice.terms,
    notes: invoice.notes,
    signatory: head.signature,
    notices: [...(zeroRated ? [EXPORT_NOTE] : []), ...(rcmTax > 0 ? [reverseChargeNote(rcmTax, formatINRForPrint)] : []), ...(isTax ? [] : ['Not a tax invoice. No GST charged.'])],
    // A Folio document always prints its signature block, so the footer never says it needs no signature.
    footer: footerText([brandLine(from), number, isTax ? null : 'Not a tax invoice. No GST charged.'], head.signature),
    watermark: invoice.status === 'void' ? 'VOID' : undefined,
  }
}

export async function renderInvoicePdf(orgId: Types.ObjectId, invoice: InvoiceDoc, extras: Extras): Promise<Buffer> {
  return renderPdf(<FolioPdf model={await invoicePdfModel(orgId, invoice, extras)} />)
}

/** "VWX-2026-27-0007.pdf" */
export const pdfFilename = (number: string | null | undefined, fallback: string) => `${(number ?? fallback).replace(/\//g, '-')}.pdf`
