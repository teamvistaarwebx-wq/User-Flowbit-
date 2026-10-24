import type { Metadata } from 'next'
import { isNewActYear } from '@/modules/muster/tax/labels'
import Link from 'next/link'
import { Download, Receipt, Settings2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { canManageSignatories, companyProfileOf, defaultSignatoryOf } from '@/lib/company-profile'
import { requireMember } from '@/lib/ctx'
import { fiscalYear, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { ListCard, TABLE } from '@/components/muster/ui/list-card'
import { VerifyWithCa } from '@/components/muster/tax/ca-banner'
import { YearSettingsForm } from '@/components/muster/tax/year-settings-form'
import { Employee } from '@/models/muster/Employee'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { visibleFilter, visibleEmployeeIds } from '@/modules/muster/people/scope'
import { statutoryFor } from '@/modules/muster/payroll/queries'
import { declarationsFor, taxYearSettings, ytdFor } from '@/modules/muster/tax/queries'
import { PROOF_STATUS_LABEL, PROOF_STATUS_TONE } from '@/modules/muster/tax/labels'
import { REGIME_LABEL } from '@/modules/muster/tax/rules'
import { can24qExport, hasForm130Worksheet } from '@/modules/muster/tax/export-access'

export const metadata: Metadata = { title: 'Salary tax' }
const BASE = '/app/hr/payroll/tax'
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const

const fyOptions = (current: string) => {
  const start = Number(current.slice(0, 4))
  return [start - 1, start, start + 1].map((y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`).filter(isNewActYear)
}

/** HR's salary-tax desk: who chose which regime, proof reviews, YTD TDS, the 24Q export and Form 130. */
export default async function SalaryTaxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'payroll.read', feature: 'muster.payroll' })
  const company = companyProfileOf(ctx.org)
  const companySigner = defaultSignatoryOf(company)
  const current = fiscalYear(todayIST())
  const asked = first(sp.fy)
  const fy = asked && isNewActYear(asked) ? asked : current
  const start = Number(fy.slice(0, 4))
  const visible = await visibleEmployeeIds(ctx)
  const people = await ctx.db(Employee).find({ deletedAt: null, status: { $nin: ['candidate', 'offered', 'joining_pending'] }, ...visibleFilter(visible) }, { fullName: 1, code: 1, exitDate: 1 }).sort({ fullName: 1 }).lean()
  const ids = people.map((p) => p._id)
  const thisMonth = todayIST()
  const [declarations, ytd, settings, statutory, structured] = await Promise.all([
    declarationsFor(ctx, fy, ids),
    ytdFor(ctx, start + 1, 4, ids),
    taxYearSettings(ctx, fy),
    statutoryFor(ctx, Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7))),
    ctx.db(SalaryStructure).distinct('employeeId', { employeeId: { $in: ids } }),
  ])
  // Same rules as the routes: 24Q carries every PAN (sensitive details, whole company); Form 130 needs a worksheet.
  const can24q = can24qExport({ payrollRead: ctx.can('payroll.read'), sensitive: ctx.can('people.read_sensitive'), seesEveryone: visible === null })
  const structuredIds = new Set(structured.map(String))
  const paidIds = new Set(ytd.keys())
  const auto = statutory.settings?.tds.enabled && statutory.settings.tds.mode === 'auto'
  const pendingProofs = [...declarations.values()].filter((d) => d.proofStatus === 'submitted').length
  return (
    <>
      <PageHeader
        title="Salary tax"
        description={`Regimes, declarations, proofs and TDS for tax year ${fy}. Exports for your CA: the quarterly 24Q (Form 138) data and Form 130 Part B per person.`}
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          <div className="flex flex-wrap gap-2">
            {fyOptions(current).map((y) => (
              <Link key={y} href={`${BASE}?fy=${y}`} className={buttonClass(y === fy ? 'secondary' : 'ghost', 'sm')}>{y}</Link>
            ))}
          </div>
        }
      />
      <div className="flex flex-col gap-3">
        <VerifyWithCa />
        {!auto ? (
          <Card>
            <CardHeader label="Automatic TDS is off" description="Payroll deducts TDS only when you add it by hand. Turn on “Compute TDS each month” in Salary structures → Statutory rates to have Flowbit work it out from each person's worksheet." actions={<Link href="/app/hr/payroll/structures?tab=statutory" className={buttonClass('secondary', 'sm')}>Statutory rates</Link>} />
          </Card>
        ) : null}
        <ListCard
          label="People"
          icon={<Receipt />}
          description={`${people.length} people${pendingProofs ? ` · ${pendingProofs} with proofs to review` : ''}`}
          actions={can24q ? QUARTERS.map((q) => (
            <a key={q} href={`/api/muster/tax/24q?fy=${fy}&quarter=${q}`} className={buttonClass('ghost', 'sm')}>
              <Download className="size-3.5" /> 24Q {q}
            </a>
          )) : null}
        >
          {people.length === 0 ? (
            <EmptyState compact icon={<Receipt />} title="Nobody on payroll yet" description="Add people and their salary structures first." />
          ) : (
            <div className="overflow-x-auto">
              <table className={TABLE.table}>
                <thead>
                  <tr className={TABLE.headRow}>
                    <th className={TABLE.th}>Person</th>
                    <th className={TABLE.th}>Regime</th>
                    <th className={cn(TABLE.th, 'hidden md:table-cell')}>Proofs</th>
                    <th className={cn(TABLE.th, 'text-right')}>TDS this year</th>
                    <th className={cn(TABLE.th, 'text-right')}>Form 130</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const d = declarations.get(String(p._id))
                    const status = d?.proofStatus ?? 'none'
                    return (
                      <tr key={String(p._id)} className={TABLE.row}>
                        <td className={TABLE.td}>
                          <Link href={`${BASE}/${p._id}?fy=${fy}`} className="text-white hover:underline">{p.fullName}</Link>
                          <span className="ml-2 text-fg-2">{p.code}</span>
                        </td>
                        <td className={TABLE.td}>{d ? REGIME_LABEL[d.regime === 'old' ? 'old' : 'new'] : <span className="text-fg-2">Not declared (new)</span>}</td>
                        <td className={cn(TABLE.td, 'hidden md:table-cell')}><Badge tone={PROOF_STATUS_TONE[status]}>{PROOF_STATUS_LABEL[status]}</Badge></td>
                        <td className={cn(TABLE.td, 'text-right tabular-nums')}>{formatINR(ytd.get(String(p._id))?.tds ?? 0)}</td>
                        <td className={cn(TABLE.td, 'text-right')}>
                          {hasForm130Worksheet(String(p._id), structuredIds, paidIds) ? (
                            <a href={`/api/muster/tax/form130/${p._id}?fy=${fy}`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}>
                              <Download className="size-3.5" /> PDF
                            </a>
                          ) : (
                            <span className="text-fg-2" title="Add a salary structure first">No worksheet</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ListCard>
        {ctx.can('payroll.run') ? (
          <Card>
            <CardHeader label="Tax year settings" icon={<Settings2 />} description="Close declarations when the year's regime choices are final, open a proof window (usually January), and record the TAN and signatory printed on Form 130." />
            <YearSettingsForm
              fy={fy}
              values={{
                declarationsOpen: settings?.declarationsOpen !== false,
                proofOpens: settings?.proofOpens ?? '',
                proofCloses: settings?.proofCloses ?? '',
                tan: settings?.tan ?? '',
                signatoryName: settings?.signatory?.name ?? '',
                signatoryDesignation: settings?.signatory?.designation ?? '',
                signatoryPlace: settings?.signatory?.place ?? '',
              }}
              signers={company.signatories.map((s) => ({ id: s.id, name: s.name, designation: s.designation }))}
              defaultLabel={companySigner ? `${companySigner.name}, ${companySigner.designation}` : null}
              canEditProfile={canManageSignatories(ctx)}
            />
          </Card>
        ) : null}
      </div>
    </>
  )
}
