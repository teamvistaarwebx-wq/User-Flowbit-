import Link from 'next/link'
import { Download, ListTree, X } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader, SectionLabel } from '@/components/ui/card'
import { KeyValue } from '@/components/ui/key-value'
import type { EntrySnapshot } from '@/modules/muster/payroll/snapshot'
import { Figures } from '../ui/figures'
import { Note } from '../ui/note'
import { AdjustmentForm, VoidAdjustment } from './entry-controls'
import { TdsOverrideControls } from '../tax/override-form'
import { REGIME_LABEL } from '@/modules/muster/tax/rules'

type Line = { code: string; label: string; lineType: string; amount: number; isAdjustment?: boolean | null; reason?: string | null }
type Adjustment = { id: string; label: string; lineType: string; amount: number; reason: string; by: string }

export type BreakdownProps = {
  cycleId: string
  closeHref: string
  entry: { id: string; employeeId: string; name: string; code: string; monthlyGross: number; payableDays: number; workingDays: number; lopDays: number; earnedGross: number; totalEarnings: number; totalDeductions: number; reimbursementAmount: number; netPay: number; warnings: string[]; notes: string | null; lines: Line[] }
  snapshot: EntrySnapshot | null
  adjustments: Adjustment[]
  editable: boolean
}

function Lines({ title, lines, total }: { title: string; lines: Line[]; total?: number }) {
  return (
    <div>
      <SectionLabel className="mb-2">{title}</SectionLabel>
      <ul className="border-t border-line text-[13px]">
        {lines.length ? (
          lines.map((l) => (
            <li key={`${l.code}-${l.label}`} className="flex items-start justify-between gap-3 py-2">
              <span className="text-white/80">
                {l.label}
                {l.isAdjustment && l.reason ? <span className="block text-xs text-fg-2">{l.reason}</span> : null}
              </span>
              <span className="tabular-nums text-white">{formatINR(l.amount)}</span>
            </li>
          ))
        ) : (
          <li className="py-2 text-fg-2">None</li>
        )}
        {total !== undefined ? (
          <li className="flex justify-between border-t border-white/[0.12] py-2 font-semibold text-white">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(total)}</span>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

/** One person's month: figures, lines, the inputs it was computed from, and adjustments. */
export function EntryBreakdown({ cycleId, closeHref, entry, snapshot, adjustments, editable }: BreakdownProps) {
  const of = (type: string) => entry.lines.filter((l) => l.lineType === type)
  return (
    <Card className="rounded-[14px] lit-edge-bright animate-slide-up">
      <CardHeader
        label="Entry breakdown"
        icon={<ListTree />}
        title={`${entry.name} · ${entry.code}`}
        description={entry.notes ?? undefined}
        actions={
          <>
            <a href={`/api/muster/payslips/${entry.id}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
              <Download className="size-3.5" /> Payslip PDF
            </a>
            <Link href={closeHref} scroll={false} className={buttonClass('ghost', 'sm')} aria-label="Close breakdown">
              <X className="size-4" />
            </Link>
          </>
        }
      />
      <Figures
        items={[
          { label: 'Monthly gross', value: formatINR(entry.monthlyGross) },
          { label: 'Payable days', value: `${entry.payableDays} of ${entry.workingDays}` },
          { label: 'Earned salary', value: formatINR(entry.earnedGross) },
          { label: 'Net pay', value: formatINR(entry.netPay) },
        ]}
      />
      {entry.warnings.length ? (
        <Note className="mt-5" tone="warning" title={`${entry.warnings.length} warning${entry.warnings.length === 1 ? '' : 's'}`}>
          <ul className="space-y-0.5">
            {entry.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Note>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Lines title="Earnings" lines={of('earning')} total={entry.totalEarnings} />
        <Lines title="Deductions" lines={of('deduction')} total={entry.totalDeductions} />
        <div className="space-y-4">
          <Lines title="Employer contributions" lines={of('employer_contribution')} />
          {entry.reimbursementAmount ? <Lines title="Reimbursements" lines={of('reimbursement')} /> : null}
        </div>
      </div>
      {snapshot ? (
        <div className="mt-5">
          <SectionLabel className="mb-2">Computed from</SectionLabel>
          <KeyValue
            columns={3}
            items={[
              { label: 'Structure from', value: formatDate(snapshot.structure.effectiveFrom) },
              { label: 'Statutory rates', value: `Effective ${formatDate(snapshot.statutoryVersion.effectiveFrom)}` },
              { label: 'LOP days', value: String(entry.lopDays) },
              { label: 'PF wage', value: formatINR(snapshot.result.pfWage) },
              { label: 'ESI wage', value: formatINR(snapshot.result.esiWage) },
              { label: 'Days assumed present', value: String(snapshot.attendance.assumedDays) },
              { label: 'PT state', value: snapshot.employee.ptState || '—' },
              { label: 'Claims in this pay', value: String(snapshot.reimbursement.claimIds.length) },
              { label: 'Generated', value: formatDate(snapshot.generatedAt) },
            ]}
          />
        </div>
      ) : null}
      {snapshot?.tax ? (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Income tax (TDS)</SectionLabel>
            <span className="flex flex-wrap items-center gap-2">
              <Link href={`/app/hr/payroll/tax/${entry.employeeId}?fy=${snapshot.tax.fy}`} className={buttonClass('ghost', 'sm')}>Worksheet</Link>
              {editable ? <TdsOverrideControls cycleId={cycleId} employeeId={entry.employeeId} overridden={snapshot.tax.overridden} /> : null}
            </span>
          </div>
          <KeyValue
            columns={3}
            items={[
              { label: 'Regime', value: REGIME_LABEL[snapshot.tax.regime] },
              { label: 'Computed this month', value: formatINR(snapshot.tax.computedPaise) },
              { label: 'Year tax (projected)', value: formatINR(snapshot.tax.worksheet.tax.totalTax * 100) },
              { label: 'Declarations', value: snapshot.tax.verified ? 'Proofs verified' : 'As declared' },
              { label: 'Override', value: snapshot.tax.overridden ? (snapshot.tax.reason ?? 'Yes') : 'None' },
            ]}
          />
        </div>
      ) : null}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <SectionLabel>Adjustments this month</SectionLabel>
          {editable ? <AdjustmentForm cycleId={cycleId} employeeId={entry.employeeId} /> : null}
        </div>
        {adjustments.length ? (
          <ul className="border-t border-line text-[13px]">
            {adjustments.map((a) => {
              const applied = entry.lines.some((l) => l.isAdjustment && l.label === a.label)
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 border-b border-white/[0.08] py-2 last:border-0">
                  <span className="min-w-0">
                    <span className="text-white">{a.label}</span> <span className="text-fg-2">· {a.lineType} · {a.reason} · by {a.by}</span>
                    {!applied ? <span className="ml-2 text-xs text-warning">waiting for regeneration</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-white">{formatINR(a.amount)}</span>
                    {editable ? <VoidAdjustment cycleId={cycleId} adjustmentId={a.id} label={a.label} /> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-fg-2">No adjustments. Add a bonus, arrears, TDS or a recovery here; it applies when payroll is regenerated.</p>
        )}
      </div>
    </Card>
  )
}
