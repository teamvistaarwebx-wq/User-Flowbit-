import type { ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import { Text } from '@react-pdf/renderer'
import { formatDate } from '@/lib/dates'
import { amountInWords, formatINRForPrint } from '@/lib/money'
import { FLOWBIT_MARK_PNG, PdfDocument, PdfKeyValue, PdfSection, PdfTable } from '@/lib/pdf/base'
import { printableLine } from './selection'
import { COMPANY_LEGAL_NAME } from '@/lib/company'
import { FIRST_YEAR_DISCOUNT_KEY, listValueOf } from '@/lib/first-year-discount'

/** The fields of a SubscriptionInvoice the PDF reads (a lean document fits). */
export type InvoiceForPdf = {
  number: string
  issueDate: string
  periodStart: string
  periodEnd: string
  status?: string | null
  isTest?: boolean | null
  sac: string
  supplyType: string
  supplier?: { legalName?: string | null; gstin?: string | null; pan?: string | null; address?: string | null; email?: string | null } | null
  customer?: {
    legalName?: string | null
    gstin?: string | null
    email?: string | null
    address?: { line1?: string | null; line2?: string | null; city?: string | null; stateCode?: string | null; pincode?: string | null } | null
  } | null
  placeOfSupply?: { gstStateCode?: string | null; name?: string | null } | null
  lines: { description: string; productKey?: string | null; quantity: number; unitPaise: number; amountPaise: number }[]
  taxableValuePaise: number
  cgstPaise?: number | null
  sgstPaise?: number | null
  igstPaise?: number | null
  roundOffPaise?: number | null
  totalPaise: number
  payment?: { provider?: string | null; paymentId?: string | null; paidAt?: Date | string | null; utr?: string | null; mode?: string | null } | null
  /** Due bills (status 'due'): bill or proforma, due date, the payment link. */
  billType?: string | null
  dueDate?: string | null
  paymentLink?: { shortUrl?: string | null } | null
  tds?: { declared?: boolean | null; amountPaise?: number | null } | null
}

/** "Rs. 1,234.00", or "-Rs. 1,234.00" for a discount. */
const money = (paise: number) => (paise < 0 ? `-${formatINRForPrint(-paise)}` : formatINRForPrint(paise))

/** The first-year discount rows above the taxable value: the gross value, then the discount (none without one). */
function discountRows(invoice: InvoiceForPdf): { label: string; value: string }[] {
  const discount = -invoice.lines.filter((l) => l.productKey === FIRST_YEAR_DISCOUNT_KEY).reduce((sum, l) => sum + l.amountPaise, 0)
  if (discount <= 0) return []
  return [
    { label: 'Gross value', value: money(listValueOf(invoice.lines)) },
    { label: 'Less: first-year discount', value: money(-discount) },
  ]
}

/**
 * No GST on this document: Flowbit had no GSTIN when it was issued (D8), so it
 * is labelled "not a tax invoice" and carries no GST lines. Older invoices
 * stored a GST supply type even without a GSTIN; they read as no-GST too.
 */
export const isNoGstInvoice = (invoice: Pick<InvoiceForPdf, 'supplyType' | 'supplier'>) => invoice.supplyType === 'no_gst' || !invoice.supplier?.gstin

function watermarkOf(invoice: InvoiceForPdf): string | undefined {
  if (invoice.status === 'cancelled') return 'CANCELLED'
  if (invoice.isTest) return 'TEST'
  return undefined
}

/** The line under the title on a no-GST document. */
export const NO_GST_NOTE = 'Not a tax invoice. Flowbit is not registered for GST yet, so no GST is charged.'

function paymentLine(invoice: InvoiceForPdf): string {
  if (invoice.status === 'due') return invoice.paymentLink?.shortUrl ? `Pay online: ${invoice.paymentLink.shortUrl}` : 'Pay by bank transfer or UPI to the account given by Flowbit, then share the UTR.'
  const paidOn = invoice.payment?.paidAt ? formatDate(new Date(invoice.payment.paidAt)) : formatDate(invoice.issueDate)
  if (invoice.payment?.provider === 'razorpay') return `Paid via Razorpay · ${invoice.payment.paymentId ?? ''} · ${paidOn}`
  if (invoice.payment?.provider === 'manual') return `Set by Flowbit · ${paidOn}`
  if (invoice.payment?.provider === 'offline') return `Paid by ${(invoice.payment.mode ?? 'bank transfer').toUpperCase()} · UTR ${invoice.payment.utr ?? ''} · ${paidOn} · verified by Flowbit`
  return `Simulated payment (test mode) · ${paidOn}`
}

const DUE_NOTE = 'Not a tax invoice. The GST tax invoice is issued when payment is received.'

export function titleOf(invoice: InvoiceForPdf): string {
  if (invoice.status === 'due') return invoice.billType === 'proforma' ? 'PROFORMA INVOICE' : 'BILL'
  const base = isNoGstInvoice(invoice) ? 'INVOICE (NOT A TAX INVOICE)' : 'TAX INVOICE'
  return invoice.isTest ? `${base} — TEST` : base
}

function subtitleOf(invoice: InvoiceForPdf): string | undefined {
  if (isNoGstInvoice(invoice)) return invoice.isTest ? `${NO_GST_NOTE} Simulated payment.` : NO_GST_NOTE
  if (invoice.status === 'due') return DUE_NOTE
  return invoice.isTest ? 'Simulated payment, not valid for tax' : undefined
}

/** The tax rows: none without GST, CGST + SGST within a state, IGST across states. */
function taxRows(invoice: InvoiceForPdf): { label: string; value: string }[] {
  if (isNoGstInvoice(invoice)) return []
  if (invoice.supplyType === 'intra_state') {
    return [
      { label: 'CGST 9%', value: money(invoice.cgstPaise ?? 0) },
      { label: 'SGST 9%', value: money(invoice.sgstPaise ?? 0) },
    ]
  }
  return [{ label: 'IGST 18%', value: money(invoice.igstPaise ?? 0) }]
}

function metaOf(invoice: InvoiceForPdf, pos: string) {
  if (invoice.status === 'due') {
    return [
      { label: 'Bill no.', value: invoice.number },
      { label: 'Bill date', value: formatDate(invoice.issueDate) },
      { label: 'Due date', value: invoice.dueDate ? formatDate(invoice.dueDate) : '—' },
      { label: 'Place of supply', value: pos },
    ]
  }
  return [
    { label: 'Invoice no.', value: invoice.number },
    { label: 'Invoice date', value: formatDate(invoice.issueDate) },
    { label: 'Place of supply', value: pos },
    { label: 'Reverse charge', value: 'No' },
  ]
}

/** Flowbit's GST tax invoice (or, while unpaid, its bill / proforma; without a GSTIN, an invoice that is not a tax invoice), printed on white with Flowbit as the issuer. */
export function InvoicePdf({ invoice }: { invoice: InvoiceForPdf }): ReactElement<DocumentProps> {
  const supplier = invoice.supplier ?? {}
  const customer = invoice.customer ?? {}
  const address = customer.address ?? {}
  const noGst = isNoGstInvoice(invoice)
  const pos = invoice.placeOfSupply?.name ? `${invoice.placeOfSupply.name} (${invoice.placeOfSupply.gstStateCode})` : '—'
  return (
    <PdfDocument
      org={{ name: customer.legalName ?? 'Customer' }}
      issuer={{
        name: supplier.legalName ?? COMPANY_LEGAL_NAME,
        addressLines: supplier.address ? [supplier.address] : [],
        gstin: supplier.gstin || 'not registered',
        pan: supplier.pan,
        email: supplier.email,
        logoSrc: FLOWBIT_MARK_PNG,
      }}
      watermark={watermarkOf(invoice)}
      title={titleOf(invoice)}
      subtitle={subtitleOf(invoice)}
      documentTitle={`Flowbit ${invoice.status === 'due' ? 'bill' : 'invoice'} ${invoice.number}`}
      meta={metaOf(invoice, pos)}
    >
      <PdfSection label="Bill to">
        <Text style={{ fontWeight: 600 }}>{customer.legalName ?? '—'}</Text>
        <Text>{[address.line1, address.line2].filter(Boolean).join(', ')}</Text>
        <Text>{[address.city, address.pincode].filter(Boolean).join(' ')}</Text>
        <Text>GSTIN: {customer.gstin || 'Unregistered'}</Text>
        {customer.email ? <Text>{customer.email}</Text> : null}
      </PdfSection>
      <PdfSection label={`Period ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}`}>
        <PdfTable
          columns={[
            { key: 'n', header: '#', width: '5%' },
            { key: 'd', header: 'Description', width: '47%' },
            { key: 's', header: 'SAC', width: '10%' },
            { key: 'q', header: 'Qty', width: '8%', align: 'right' },
            { key: 'r', header: 'Rate', width: '14%', align: 'right' },
            { key: 'a', header: noGst ? 'Amount' : 'Taxable value', width: '16%', align: 'right' },
          ]}
          rows={invoice.lines.map((l, i) => ({ n: String(i + 1), d: printableLine(l.description), s: invoice.sac, q: String(l.quantity), r: money(l.unitPaise), a: money(l.amountPaise) }))}
        />
      </PdfSection>
      <PdfKeyValue
        items={[
          ...discountRows(invoice),
          { label: noGst ? 'Value' : 'Taxable value', value: money(invoice.taxableValuePaise) },
          ...taxRows(invoice),
          ...(invoice.roundOffPaise ? [{ label: 'Round off', value: money(invoice.roundOffPaise) }] : []),
          { label: 'Total', value: money(invoice.totalPaise), strong: true },
        ]}
      />
      <PdfSection label="Amount in words">
        <Text>{amountInWords(invoice.totalPaise).replace(/^Rupees/, 'Indian Rupees')}</Text>
      </PdfSection>
      <PdfSection label="Payment">
        <Text>{paymentLine(invoice)}</Text>
        {invoice.tds?.declared && invoice.tds.amountPaise ? <Text>{invoice.status === 'due' ? `TDS: you may deduct ${money(invoice.tds.amountPaise)} (2%) and pay the rest; send us the TDS certificate.` : `TDS deducted by the customer: ${money(invoice.tds.amountPaise)}.`}</Text> : null}
        {invoice.status === 'cancelled' ? <Text>This invoice was cancelled by Flowbit. Its number is kept in the series.</Text> : null}
      </PdfSection>
    </PdfDocument>
  )
}
