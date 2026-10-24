import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isValidObjectId } from 'mongoose'
import { Download, FileText } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { fiscalYear, formatDate, todayIST } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { first, type SearchParams } from '@/lib/list'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { KeyValue } from '@/components/ui/key-value'
import { PageHeader } from '@/components/ui/page-header'
import { Note } from '@/components/muster/ui/note'
import { VerifyWithCa } from '@/components/muster/tax/ca-banner'
import { ReviewForm } from '@/components/muster/tax/review-form'
import { WorksheetCard } from '@/components/muster/tax/worksheet-card'
import { Employee } from '@/models/muster/Employee'
import { TaxDeclaration } from '@/models/muster/TaxDeclaration'
import { assertVisible } from '@/modules/muster/people/scope'
import { amountsOf } from '@/modules/muster/tax/queries'
import { PROOF_STATUS_LABEL, PROOF_STATUS_TONE } from '@/modules/muster/tax/labels'
import { REGIME_LABEL } from '@/modules/muster/tax/rules'
import { worksheetView } from '@/modules/muster/tax/worksheet-view'

export const metadata: Metadata = { title: 'Tax worksheet' }

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

/** One person's tax year: declaration, proofs (with HR's review) and the worksheet. */
export default async function TaxWorksheetPage({ params, searchParams }: { params: Promise<{ employeeId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ employeeId }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'muster', perm: 'payroll.read', feature: 'muster.payroll' })
  if (!isValidObjectId(employeeId)) notFound()
  await assertVisible(ctx, employeeId)
  const employee = await ctx.db(Employee).findOne({ _id: employeeId, deletedAt: null }).lean()
  if (!employee) notFound()
  const asked = first(sp.fy)
  const fy = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : fiscalYear(todayIST())
  const [declaration, view] = await Promise.all([ctx.db(TaxDeclaration).findOne({ fy, employeeId: employee._id }).lean(), worksheetView(ctx, employee, fy)])
  const status = declaration?.proofStatus ?? 'none'
  const d = amountsOf(declaration?.declared)
  return (
    <>
      <PageHeader
        title={`${employee.fullName} · tax ${fy}`}
        description="The declaration, the proofs and how this year's TDS is worked out."
        breadcrumb={[{ label: 'Payroll', href: '/app/hr/payroll' }, { label: 'Salary tax', href: `/app/hr/payroll/tax?fy=${fy}` }, { label: employee.fullName, href: `/app/hr/payroll/tax/${employee._id}?fy=${fy}` }]}
        actions={
          <a href={`/api/muster/tax/form130/${employee._id}?fy=${fy}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
            <Download className="size-3.5" /> Form 130 Part B
          </a>
        }
      />
      <div className="flex flex-col gap-3">
        <VerifyWithCa />
        <Card>
          <CardHeader
            label="Declaration"
            title={declaration ? REGIME_LABEL[declaration.regime === 'old' ? 'old' : 'new'] : 'Not declared: new regime, no deductions'}
            description={declaration?.submittedAt ? `Saved ${formatDate(declaration.submittedAt)}` : undefined}
            actions={<Badge tone={PROOF_STATUS_TONE[status]}>{PROOF_STATUS_LABEL[status]}</Badge>}
          />
          <KeyValue
            columns={3}
            items={[
              { label: '80C', value: rupees(d.sec80c) },
              { label: '80D self / parents', value: `${rupees(d.sec80dSelf)} / ${rupees(d.sec80dParents)}` },
              { label: 'NPS 80CCD(1B)', value: rupees(d.nps80ccd1b) },
              { label: 'Home loan interest', value: rupees(d.homeLoanInterest) },
              { label: 'Rent a month', value: `${rupees(d.rentMonthly)}${d.metro ? ' · metro' : ''}` },
              { label: "Landlord's PAN", value: d.landlordPan || '—' },
              { label: 'Previous employer salary / TDS', value: `${rupees(d.previousEmployer.taxableSalary)} / ${rupees(d.previousEmployer.tds)}` },
            ]}
          />
        </Card>
        <Card>
          <CardHeader label="Proofs" icon={<FileText />} description={declaration?.proofNote ? `Their note: ${declaration.proofNote}` : undefined} />
          {declaration?.proofFiles?.length ? (
            <ul className="mb-4 space-y-1 text-sm">
              {declaration.proofFiles.map((f) => (
                <li key={String(f.fileId)}><a className="text-[#8E8DFF] hover:underline" href={fileUrl(f.fileId)} target="_blank" rel="noreferrer">{f.name}</a></li>
              ))}
            </ul>
          ) : <p className="mb-4 text-sm text-fg-2">No proofs uploaded.</p>}
          {declaration?.reviewNote ? <Note className="mb-4" tone="neutral" title={`Review by ${declaration.reviewedByName ?? 'HR'}`}>{declaration.reviewNote}</Note> : null}
          {declaration && ctx.can('payroll.run') && status !== 'verified' ? <ReviewForm fy={fy} employeeId={String(employee._id)} values={{ ...d, landlordName: declaration.declared?.landlordName ?? '' }} /> : null}
        </Card>
        {view ? <WorksheetCard tax={view.tax} source={view.source} monthLabel={view.monthLabel} /> : <Note tone="neutral">No salary structure in force, so there is no worksheet yet.</Note>}
      </div>
    </>
  )
}
