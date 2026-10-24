'use client'

import { FlaskConical, Receipt } from 'lucide-react'
import { FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS, type InvoiceTotals, type SelectionQuote } from '@/lib/billing'
import { formatINR } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/ui/card'
import { COMPANY_LEGAL_NAME } from '@/lib/company'

const money = (paise: number) => formatINR(paise, { decimals: 2 })
const UNIT: Record<string, string> = { suite: 'people', work: 'users', muster_starter: 'employees', muster_business: 'employees', orbit: 'sales users', folio_firm: 'firms' }

type Props = {
  quote: SelectionQuote
  totals: InvoiceTotals
  stateKnown: boolean
  testMode: boolean
  /** Extra line under the total, e.g. the prorated charge or when a change starts. */
  note?: string
  persons: number
  buttonLabel: string
  onSubmit: () => void
  pending: boolean
  disabled?: boolean
  /** False while Flowbit has no GSTIN: no GST rows, and the invoice is not a tax invoice (D8). */
  chargeGst: boolean
}

/** The live price: lines with minimums, GST split by place of supply, round off, total. */
export function PlanSummary({ quote, totals, stateKnown, testMode, note, persons, buttonLabel, onSubmit, pending, disabled, chargeGst }: Props) {
  const per = quote.cycle === 'yearly' ? 'year' : 'month'
  const plusGst = chargeGst ? ' + GST' : ''
  return (
    <div className="glass space-y-4 rounded-[14px] p-5 lg:sticky lg:top-4">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel icon={<Receipt />}>Summary</SectionLabel>
        {testMode ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-warning">
            <FlaskConical className="size-3.5" strokeWidth={1.5} /> Test mode
          </span>
        ) : null}
      </div>
      {quote.lines.length ? (
        <ul className="space-y-2 text-sm">
          {quote.lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-3">
              <span className="min-w-0 text-white/80">
                {l.label}
                {l.key === 'folio' ? ` (includes ${FOLIO_INCLUDED_FIRMS} firms, ${FOLIO_INCLUDED_USERS} users)` : ` · ${l.quantity} ${UNIT[l.key] ?? ''}`}
                {l.minimumApplied ? <span className="block text-xs text-[#959596]">Billed for the {l.quantity}-{UNIT[l.key] ?? 'unit'} minimum ({l.requested} chosen)</span> : null}
              </span>
              <span className="shrink-0 text-white tabular-nums">{money(l.amountPaise)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#959596]">Choose at least one product.</p>
      )}
      <div className="space-y-1.5 border-t border-line-soft pt-3 text-sm">
        {quote.discountPaise ? <Row label={`First-year discount (${quote.discountPercent}% off)`} value={`−${money(quote.discountPaise)}`} /> : null}
        <Row label={quote.discountPaise ? (chargeGst ? 'Taxable value, first year' : 'Subtotal, first year') : `Subtotal per ${per}`} value={money(totals.taxableValuePaise)} />
        {!chargeGst ? null : !stateKnown ? (
          <Row label="GST 18%" value={money(totals.taxPaise)} />
        ) : totals.igstPaise ? (
          <Row label="IGST 18%" value={money(totals.igstPaise)} />
        ) : (
          <>
            <Row label="CGST 9%" value={money(totals.cgstPaise)} />
            <Row label="SGST 9%" value={money(totals.sgstPaise)} />
          </>
        )}
        {totals.roundOffPaise ? <Row label="Round off" value={money(totals.roundOffPaise)} /> : null}
      </div>
      <div className="flex items-end justify-between border-t border-line-soft pt-3">
        <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{quote.discountPaise ? 'Total, first year' : `Total per ${per}`}</span>
        <span className="text-2xl font-semibold text-white tabular-nums transition-opacity duration-150">{formatINR(totals.totalPaise)}</span>
      </div>
      {quote.cycle === 'yearly' && quote.lines.length ? (
        <p className="text-xs text-[#959596]">
          {quote.discountPaise ? (
            <>
              That&apos;s {formatINR(Math.round(quote.taxablePaise / 12))} a month{plusGst} in your first year. You save <span className="text-mint">{formatINR(quote.discountPaise)}</span>. Renewals are {formatINR(quote.periodAmountPaise)} a year{plusGst}.
            </>
          ) : (
            <>That&apos;s {formatINR(Math.round(quote.periodAmountPaise / 12))} a month{plusGst}, paid once a year.</>
          )}
        </p>
      ) : null}
      {quote.suiteComparisonPaise != null ? (
        <p className="rounded-[8px] bg-violet-2 px-3 py-2.5 text-xs leading-5 text-white">
          Suite would cost {formatINR(quote.suiteComparisonPaise)}/month for your {Math.max(persons, 10)} people and adds every product. Save {formatINR(quote.monthlySubtotalPaise - quote.suiteComparisonPaise)}/month.
        </p>
      ) : null}
      {note ? <p className="text-xs text-white/80">{note}</p> : null}
      {testMode ? <p className="text-xs text-warning">Razorpay keys aren&apos;t set, so payments are simulated. Use this only on your own machine.</p> : null}
      <Button variant="primary" size="lg" className="w-full" loading={pending} disabled={disabled || !quote.lines.length} onClick={onSubmit}>
        {buttonLabel}
      </Button>
      <p className="text-center text-[11px] text-[#959596]">{chargeGst ? `Prices exclude 18% GST until the total. Invoices come from ${COMPANY_LEGAL_NAME}.` : `No GST is charged: ${COMPANY_LEGAL_NAME} is not GST-registered yet, so invoices are not tax invoices.`}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-white/80">
      <span>{label}</span>
      <span className="tabular-nums text-white">{value}</span>
    </div>
  )
}
