import { Calculator } from 'lucide-react'
import { formatINR } from '@/lib/money'
import { Card, CardHeader, SectionLabel } from '@/components/ui/card'
import { Note } from '@/components/muster/ui/note'
import type { EntryTaxSnapshot } from '@/modules/muster/payroll/entry-builder'
import { REGIME_LABEL } from '@/modules/muster/tax/rules'

const rupees = (n: number) => formatINR(Math.round(n) * 100)

type Row = { label: string; value: number; strong?: boolean; minus?: boolean; hide?: boolean }

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className="border-t border-line text-[13px]">
      {rows.filter((r) => !r.hide).map((r) => (
        <li key={r.label} className={`flex items-start justify-between gap-3 py-1.5 ${r.strong ? 'border-t border-white/[0.12] font-semibold text-white' : 'text-white/80'}`}>
          <span>{r.label}</span>
          <span className="tabular-nums">{r.minus && r.value ? `− ${rupees(r.value)}` : rupees(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The yearly TDS worksheet: projected salary, deductions, tax, what is paid and this month's share. */
export function WorksheetCard({ tax, source, monthLabel }: { tax: EntryTaxSnapshot; source: 'payroll' | 'preview'; monthLabel: string }) {
  const w = tax.worksheet
  const old = w.regime === 'old'
  return (
    <Card>
      <CardHeader
        label="Tax worksheet"
        icon={<Calculator />}
        title={`${REGIME_LABEL[w.regime]} · tax year ${tax.fy}`}
        description={source === 'payroll' ? `As computed for the ${monthLabel} payroll. ${tax.verified ? 'Uses HR-verified proofs.' : 'Uses the declared amounts.'}` : `Preview on the current salary structure (${monthLabel}); payroll recomputes it each month.`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionLabel className="mb-2">Income for the year</SectionLabel>
          <Rows
            rows={[
              { label: 'Salary from this employer (paid and projected)', value: w.salaryThisEmployer },
              { label: 'Salary from a previous employer', value: w.previousEmployerSalary, hide: !w.previousEmployerSalary },
              { label: 'Gross salary', value: w.grossSalary, strong: true },
              { label: 'Standard deduction', value: w.standardDeduction, minus: true },
              { label: 'HRA exemption', value: w.hraExemption, minus: true, hide: !old },
              { label: 'Professional tax', value: w.professionalTax, minus: true, hide: !old },
              { label: '80C (incl. employee PF)', value: w.sec80c, minus: true, hide: !old },
              { label: '80D health insurance', value: w.sec80d, minus: true, hide: !old },
              { label: '80CCD(1B) NPS', value: w.nps80ccd1b, minus: true, hide: !old },
              { label: 'Home loan interest', value: w.homeLoanInterest, minus: true, hide: !old },
              { label: 'Taxable income', value: w.tax.taxableIncome, strong: true },
            ]}
          />
        </div>
        <div>
          <SectionLabel className="mb-2">Tax</SectionLabel>
          <Rows
            rows={[
              { label: 'Tax on the slabs', value: w.tax.slabTax },
              { label: 'Rebate', value: w.tax.rebate, minus: true, hide: !w.tax.rebate },
              { label: 'Surcharge', value: w.tax.surcharge, hide: !w.tax.surcharge },
              { label: 'Health and education cess', value: w.tax.cess },
              { label: 'Tax for the year', value: w.tax.totalTax, strong: true },
              { label: 'TDS already deducted here', value: w.tdsSoFar, minus: true },
              { label: 'TDS by the previous employer', value: w.previousEmployerTds, minus: true, hide: !w.previousEmployerTds },
              { label: 'Still to deduct', value: w.remainingTax, strong: true },
            ]}
          />
          <p className="mt-3 text-sm text-fg-2">
            Spread over {w.monthsLeft} month{w.monthsLeft === 1 ? '' : 's'}: <span className="font-semibold text-white">{formatINR(tax.computedPaise)}</span> a month
            {tax.overridden ? <> (overridden to the payroll figure: {tax.reason})</> : null}. In the {REGIME_LABEL[w.otherRegime.regime].toLowerCase()} the year&apos;s tax would be {rupees(w.otherRegime.totalTax)}.
          </p>
        </div>
      </div>
      {w.notes.length ? (
        <Note className="mt-4" tone="warning" title="Check">
          <ul className="space-y-0.5">{w.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Note>
      ) : null}
    </Card>
  )
}
