import 'server-only'
import type { Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { renderPdf } from '@/lib/pdf/base'
import { footerText } from '@/lib/pdf/footer'
import type { EntityDoc } from '@/modules/folio/context'
import { SUPPLY_TYPE_LABELS } from '@/modules/folio/engine/gst'
import { sgstLabel, stateLabelOf } from '@/modules/folio/engine/states'
import { billToOf, issuerOf } from '@/modules/folio/invoices/snapshots'
import type { ClientDoc } from '@/modules/folio/context'
import type { QuoteDoc } from '@/modules/folio/quotes/service'
import { brandLine, folioIssuer } from './assets'
import { EXPORT_NOTE, pricingRows } from './InvoicePdf'
import { FolioPdf, qtyLabel, taxSummaryRows, type FolioPdfModel } from './parts'

const PROFORMA_NOTE = 'PROFORMA INVOICE: This is not a tax invoice. A tax invoice will be issued on receipt of payment.'

/** A quote reads the entity and client live: it is not a statutory document and stays editable. */
export async function quotePdfModel(orgId: Types.ObjectId, quote: QuoteDoc, entity: EntityDoc, client: ClientDoc): Promise<FolioPdfModel> {
  const from = issuerOf(entity)
  const bill = billToOf(client)
  const isTax = quote.documentType === 'tax_invoice'
  const proforma = quote.kind === 'proforma'
  const zeroRated = quote.supplyType === 'export' || quote.supplyType === 'sez'
  const bank = entity.bankAccounts.find((a) => a.isDefault) ?? entity.bankAccounts[0]
  const head = await folioIssuer(orgId, from, { showGstin: isTax, brandLine: true })
  return {
    title: proforma ? 'PROFORMA INVOICE' : 'QUOTATION',
    number: quote.number,
    meta: [
      { label: proforma ? 'Proforma no.' : 'Quote no.', value: quote.number },
      { label: 'Dated', value: formatDate(quote.quoteDate) },
      { label: 'Valid until', value: formatDate(quote.validUntil) },
    ],
    issuer: head.issuer,
    legalName: from.legalName,
    isTax,
    billTo: { name: bill.name, addressLines: [...bill.addressLines, [bill.city, bill.pincode].filter(Boolean).join(' ')].filter(Boolean), extra: [bill.stateCode ? `State: ${stateLabelOf(bill.stateCode)}` : '', isTax && bill.gstin ? `GSTIN ${bill.gstin}` : ''].filter(Boolean) },
    details: [
      ...(quote.subject ? [{ label: 'For', value: quote.subject }] : []),
      ...(isTax && quote.placeOfSupplyStateCode ? [{ label: 'Place of supply', value: stateLabelOf(quote.placeOfSupplyStateCode) }] : []),
      ...(isTax && zeroRated ? [{ label: 'Supply', value: SUPPLY_TYPE_LABELS[quote.supplyType] }] : []),
    ],
    lines: quote.lines.map((l) => ({ description: l.description, hsnSac: l.hsnSac, qty: qtyLabel(l.quantity, l.unit), rate: l.ratePaise, discountPercent: l.discountPercent, gstRate: l.gstRatePercent, amount: l.taxablePaise })),
    totals: pricingRows(quote, quote.placeOfSupplyStateCode),
    totalPaise: quote.totalPaise,
    afterTotal: [],
    taxSummary: isTax && !zeroRated && quote.taxablePaise > 0 ? { rows: taxSummaryRows(quote.lines), intra: quote.supplyType === 'intra_state', sgstLabel: sgstLabel(quote.placeOfSupplyStateCode) } : undefined,
    bank: proforma && bank ? { accountName: bank.accountName, bankName: bank.bankName, branch: bank.branch, accountNumber: bank.accountNumber, ifsc: bank.ifsc, upiId: bank.upiId } : null,
    terms: quote.terms,
    notes: quote.notes,
    signatory: head.signature,
    notices: [proforma ? PROFORMA_NOTE : `Quotation · valid until ${formatDate(quote.validUntil)}`, ...(zeroRated ? [EXPORT_NOTE] : [])],
    footer: footerText([brandLine(from), quote.number], head.signature),
    watermark: quote.status === 'draft' ? 'DRAFT' : quote.status === 'declined' ? 'DECLINED' : undefined,
  }
}

export async function renderQuotePdf(orgId: Types.ObjectId, quote: QuoteDoc, entity: EntityDoc, client: ClientDoc): Promise<Buffer> {
  return renderPdf(<FolioPdf model={await quotePdfModel(orgId, quote, entity, client)} />)
}
