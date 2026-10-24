import 'server-only'
import { Text, View } from '@react-pdf/renderer'
import { formatINRForPrint } from '@/lib/money'
import { PDF_COLORS, PdfDocument, PdfKeyValue, PdfSection, PdfTable, renderPdf, type PdfOrg, type PdfSignature } from '@/lib/pdf/base'
import type { EntryTaxSnapshot } from '@/modules/muster/payroll/entry-builder'
import { REGIME_LABEL } from './rules'

/**
 * Form 130 Part B (ex-Form 16 Part B): the salary, deductions and tax computed
 * for the year, from the latest payroll worksheet. Part A (the TDS deposited,
 * with challan details) comes from TRACES, never from Flowbit.
 */

export type Form130Data = {
  fy: string
  employee: { name: string; code: string; pan: string; designation: string; from: string; to: string }
  employer: { tan: string; pan: string }
  signatory: { name: string; designation: string; place: string }
  /** The signature block: the matching authorised signatory's signature and seal (modules/muster/tax/form130-signer). */
  signature?: PdfSignature | null
  quarters: { quarter: string; amountPaid: number; tds: number }[]
  tax: EntryTaxSnapshot
  complete: boolean
}

const r = (rupees: number) => formatINRForPrint(Math.round(rupees) * 100)
const p = (paise: number) => formatINRForPrint(paise)

const COLUMNS = [
  { key: 'label', header: 'Particulars', width: 4 },
  { key: 'amount', header: 'Amount', width: 2, align: 'right' as const },
]

export function Form130Document({ org, data }: { org: PdfOrg; data: Form130Data }): ReturnType<typeof PdfDocument> {
  const w = data.tax.worksheet
  const old = w.regime === 'old'
  const income = [
    { label: '1. Gross salary from this employer', amount: r(w.salaryThisEmployer) },
    ...(w.previousEmployerSalary ? [{ label: '   Salary from a previous employer (as declared)', amount: r(w.previousEmployerSalary) }] : []),
    ...(old ? [{ label: '2. Less: HRA exemption', amount: r(w.hraExemption) }] : []),
    { label: '3. Less: standard deduction', amount: r(w.standardDeduction) },
    ...(old ? [{ label: '   Less: professional tax', amount: r(w.professionalTax) }] : []),
    ...(old ? [{ label: '4. Less: home loan interest (self-occupied)', amount: r(w.homeLoanInterest) }] : []),
    ...(old ? [{ label: '5. Deductions: 80C (incl. employee PF)', amount: r(w.sec80c) }, { label: '   80D health insurance', amount: r(w.sec80d) }, { label: '   80CCD(1B) NPS', amount: r(w.nps80ccd1b) }] : []),
    { label: '6. Total taxable income', amount: r(w.tax.taxableIncome) },
  ]
  const tax = [
    { label: '7. Tax on total income', amount: r(w.tax.slabTax) },
    { label: '8. Rebate', amount: r(w.tax.rebate) },
    { label: '9. Surcharge', amount: r(w.tax.surcharge) },
    { label: '10. Health and education cess', amount: r(w.tax.cess) },
    { label: '11. Tax payable', amount: r(w.tax.totalTax) },
    { label: '12. Tax deducted by this employer', amount: p(data.quarters.reduce((s, q) => s + q.tds, 0)) },
    ...(w.previousEmployerTds ? [{ label: '   Tax deducted by the previous employer (as declared)', amount: r(w.previousEmployerTds) }] : []),
  ]
  return (
    <PdfDocument
      org={org}
      title="FORM 130 · PART B"
      subtitle={`TAX YEAR ${data.fy}`}
      meta={[{ label: 'Regime', value: REGIME_LABEL[w.regime] }]}
      documentTitle={`Form 130 Part B ${data.fy} — ${data.employee.name}`}
      footerNote="Part A of Form 130 (TDS deposited and challan details) is downloaded from TRACES and attached by the employer. Verify these figures with your CA."
      signature={data.signature ?? { forName: org.name, name: data.signatory.name || null, designation: data.signatory.designation || null }}
    >
      {!data.complete ? (
        <View style={{ marginBottom: 8, padding: 8, borderRadius: 4, backgroundColor: PDF_COLORS.soft }}>
          <Text style={{ color: PDF_COLORS.muted }}>Provisional: the tax year&apos;s payroll is not complete, so later months are projected from the salary structure.</Text>
        </View>
      ) : null}
      <PdfSection label="Employer and employee">
        <PdfKeyValue
          width="100%"
          items={[
            { label: 'Employer TAN', value: data.employer.tan || 'Not set (set it in Salary tax, Tax year settings)' },
            { label: 'Employer PAN', value: data.employer.pan || '—' },
            { label: 'Employee', value: `${data.employee.name} (${data.employee.code})` },
            { label: 'Employee PAN', value: data.employee.pan || 'PANNOTAVBL' },
            { label: 'Designation', value: data.employee.designation || '—' },
            { label: 'Period with this employer', value: `${data.employee.from} to ${data.employee.to}` },
          ]}
        />
      </PdfSection>
      <PdfSection label="Salary and deductions">
        <PdfTable columns={COLUMNS} rows={income} />
      </PdfSection>
      <PdfSection label="Tax">
        <PdfTable columns={COLUMNS} rows={tax} />
      </PdfSection>
      <PdfSection label="TDS by quarter">
        <PdfTable
          columns={[{ key: 'quarter', header: 'Quarter', width: 1 }, { key: 'paid', header: 'Salary paid', width: 2, align: 'right' }, { key: 'tds', header: 'TDS deducted', width: 2, align: 'right' }]}
          rows={data.quarters.map((q) => ({ quarter: q.quarter, paid: p(q.amountPaid), tds: p(q.tds) }))}
        />
      </PdfSection>
      <PdfSection label="Verification">
        <Text>
          I, {data.signatory.name || '________________'}, {data.signatory.designation || '________________'}, certify that the information above is true and correct, based on the books of account, documents and the TDS statements available with the employer.
        </Text>
        <Text style={{ marginTop: 12, color: PDF_COLORS.muted }}>Place: {data.signatory.place || '________'}</Text>
      </PdfSection>
    </PdfDocument>
  )
}

export const renderForm130Pdf = (org: PdfOrg, data: Form130Data): Promise<Buffer> => renderPdf(Form130Document({ org, data }))
