import type { Metadata } from 'next'
import { Download, FileText } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { fiscalYear, formatDate, todayIST } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { localeOfUser } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { NotLinked } from '@/components/muster/me/not-linked'
import { Note } from '@/components/muster/ui/note'
import { VerifyWithCa } from '@/components/muster/tax/ca-banner'
import { DeclarationForm } from '@/components/muster/tax/declaration-form'
import { ProofForm } from '@/components/muster/tax/proof-form'
import { WorksheetCard } from '@/components/muster/tax/worksheet-card'
import { TaxDeclaration } from '@/models/muster/TaxDeclaration'
import { myEmployee } from '@/modules/muster/me/queries'
import { amountsOf, taxYearSettings } from '@/modules/muster/tax/queries'
import { isNewActYear, previousFy, PROOF_STATUS_LABEL } from '@/modules/muster/tax/labels'
import { form130For } from '@/modules/muster/tax/exports'
import { declarationWindow, proofWindow } from '@/modules/muster/tax/windows'
import { worksheetView } from '@/modules/muster/tax/worksheet-view'

export const metadata: Metadata = { title: 'My tax' }
const BASE = '/app/me/tax'

/** Self-service salary tax: regime, declaration, proofs, the worksheet and Form 130 Part B. */
export default async function MyTaxPage() {
  const ctx = await requireMember({ product: 'muster', feature: 'muster.payroll' })
  const employee = await myEmployee(ctx)
  if (!employee) return <NotLinked locale={localeOfUser(ctx.user)} />
  const fy = fiscalYear(todayIST())
  const lastFy = previousFy(fy)
  const [declaration, settings, view, lastYear] = await Promise.all([
    ctx.db(TaxDeclaration).findOne({ fy, employeeId: employee._id }).lean(),
    taxYearSettings(ctx, fy),
    worksheetView(ctx, employee, fy),
    isNewActYear(lastFy) ? form130For(ctx, lastFy, employee._id) : null,
  ])
  const declWindow = declarationWindow(settings)
  const proofs = proofWindow(settings, todayIST())
  const verified = declaration?.proofStatus === 'verified'
  const status = declaration?.proofStatus ?? 'none'
  return (
    <>
      <PageHeader
        title="My tax"
        description={`Your tax regime, investment declaration and proofs for tax year ${fy}, and how your monthly TDS is worked out.`}
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          view || lastYear?.tax ? (
            <div className="flex flex-wrap gap-2">
              {lastYear?.tax ? (
                <a href={`/api/muster/tax/form130/${employee._id}?fy=${lastFy}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
                  <Download className="size-3.5" /> Form 130 {lastFy}
                </a>
              ) : null}
              {view ? (
                <a href={`/api/muster/tax/form130/${employee._id}?fy=${fy}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
                  <Download className="size-3.5" /> Form 130 Part B
                </a>
              ) : null}
            </div>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3">
        <VerifyWithCa />
        <Card>
          <CardHeader label="Declaration" title={`Tax year ${fy}`} description={declaration?.submittedAt ? `Last saved ${formatDate(declaration.submittedAt)}.` : 'Not saved yet: TDS uses the new regime with no deductions.'} actions={<Badge tone={verified ? 'success' : 'neutral'}>{PROOF_STATUS_LABEL[status]}</Badge>} />
          {!declWindow.open ? <Note className="mb-4" tone="neutral">{declWindow.reason}</Note> : null}
          {verified ? <Note className="mb-4" tone="neutral">HR verified your proofs, so this declaration is final for the year.</Note> : null}
          <DeclarationForm fy={fy} regime={declaration?.regime === 'old' ? 'old' : 'new'} values={{ ...amountsOf(declaration?.declared), landlordName: declaration?.declared?.landlordName ?? '' }} disabled={!declWindow.open || verified} />
        </Card>
        <Card>
          <CardHeader label="Proofs" icon={<FileText />} description={settings?.proofOpens && settings.proofCloses ? `Proof window: ${formatDate(settings.proofOpens)} to ${formatDate(settings.proofCloses)}.` : 'HR opens a proof window, usually in January.'} />
          {declaration?.reviewNote && status === 'rejected' ? <Note className="mb-4" tone="warning" title="HR sent your proofs back">{declaration.reviewNote}</Note> : null}
          {declaration?.proofFiles?.length ? (
            <ul className="mb-4 space-y-1 text-sm">
              {declaration.proofFiles.map((f) => (
                <li key={String(f.fileId)}><a className="text-[#8E8DFF] hover:underline" href={fileUrl(f.fileId)} target="_blank" rel="noreferrer">{f.name}</a></li>
              ))}
            </ul>
          ) : null}
          {proofs.open && !verified ? <ProofForm fy={fy} /> : <p className="text-sm text-fg-2">{verified ? 'Verified.' : proofs.open ? '' : proofs.reason}</p>}
        </Card>
        {view ? <WorksheetCard tax={view.tax} source={view.source} monthLabel={view.monthLabel} /> : <Note tone="neutral">Your worksheet appears once HR sets up your salary structure.</Note>}
      </div>
    </>
  )
}
