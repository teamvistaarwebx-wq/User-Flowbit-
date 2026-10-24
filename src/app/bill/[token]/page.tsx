import type { Metadata } from 'next'
import { CreditCard, Download } from 'lucide-react'
import { PublicShell, Unavailable } from '@/components/doclinks/public-shell'
import { buttonClass } from '@/components/ui/button-styles'
import { COMPANY_LEGAL_NAME } from '@/lib/company'
import { formatDate } from '@/lib/dates'
import { chargesGst } from '@/lib/billing'
import { flowbitSupplier } from '@/lib/env'
import { formatINR } from '@/lib/money'
import { billByToken } from '@/modules/billing/public-bill'
import { billBalancePaise } from '@/modules/billing/rules'
import { printableLine } from '@/modules/subscription/selection'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Flowbit bill', robots: { index: false, follow: false } }

const FLOWBIT_COLOR = '#BB62A5'

/** Flowbit's own bill or invoice by its public link: amount, due date, PDF and Pay now (console spec 11). */
export default async function PublicBillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const bill = await billByToken(token)
  if (!bill) return <Unavailable title="This link is not available" body="Ask Flowbit for a fresh link: support is on useflowbit.com." />
  const supplier = flowbitSupplier()
  const due = bill.status === 'due'
  const balance = billBalancePaise(bill)
  const title = due ? (bill.billType === 'proforma' ? 'Proforma invoice' : 'Bill') : bill.status === 'cancelled' ? 'Cancelled' : 'Tax invoice'
  return (
    <PublicShell brand={{ name: 'Flowbit', legalName: supplier.legalName || COMPANY_LEGAL_NAME, addressLines: supplier.address ? [supplier.address] : [], gstin: supplier.gstin, email: supplier.supportEmail, phone: null, logoSrc: null, color: FLOWBIT_COLOR }}>
      <section className="glass-hero lit-edge-bright mx-auto max-w-xl space-y-5 px-6 py-7">
        <div>
          <p className="text-xs uppercase tracking-[0.06em] text-[#979797]">{title} · {bill.number}</p>
          <h1 className="mt-1 text-2xl font-semibold text-white tabular-nums">{formatINR(due ? balance : bill.totalPaise, { decimals: 2 })}</h1>
          <p className="mt-1 text-sm text-fg-2">
            {due ? `Due ${formatDate(bill.dueDate ?? bill.issueDate)}` : bill.status === 'cancelled' ? 'This bill was cancelled; nothing is due on it.' : `Paid · issued ${formatDate(bill.issueDate)}`} · billed to {bill.customer?.legalName}
          </p>
        </div>
        <ul className="space-y-2 text-sm">
          {bill.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4"><span className="text-fg-2">{printableLine(l.description)}</span><span className="shrink-0 tabular-nums text-white">{formatINR(l.amountPaise, { decimals: 2 })}</span></li>
          ))}
          {chargesGst(bill.supplyType) ? <li className="flex justify-between gap-4 border-t border-line pt-2"><span className="text-fg-2">GST 18%</span><span className="tabular-nums text-white">{formatINR(bill.taxPaise ?? 0, { decimals: 2 })}</span></li> : <li className="border-t border-line pt-2 text-xs text-fg-2">No GST: Flowbit is not GST-registered yet, so this is not a tax invoice.</li>}
          {due && bill.tds?.declared ? <li className="flex justify-between gap-4"><span className="text-fg-2">Less TDS 2% (send us the certificate)</span><span className="tabular-nums text-white">−{formatINR(bill.tds.amountPaise ?? 0, { decimals: 2 })}</span></li> : null}
        </ul>
        <div className="flex flex-wrap gap-2">
          {due && bill.paymentLink?.shortUrl && bill.paymentLink.status !== 'cancelled' ? <a href={bill.paymentLink.shortUrl} className={buttonClass('primary', 'md')}><CreditCard className="size-4" /> Pay now</a> : null}
          <a href={`/api/public/bill/${token}/pdf`} className={buttonClass('secondary', 'md')}><Download className="size-4" /> Download PDF</a>
        </div>
        {due ? <p className="text-xs text-[#979797]">Paid by bank transfer or UPI instead? Sign in to Flowbit and share the UTR from Settings → Plan & billing. {chargesGst(bill.supplyType) ? 'The GST tax invoice is issued when the payment arrives.' : 'The invoice is issued when the payment arrives.'}</p> : null}
      </section>
    </PublicShell>
  )
}
