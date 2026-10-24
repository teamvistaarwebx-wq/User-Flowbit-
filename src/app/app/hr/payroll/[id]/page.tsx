import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Download, Users } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatDateTime, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { buttonClass } from '@/components/ui/button-styles'
import { DownloadLink } from '@/components/ui/download-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { Stepper } from '@/components/ui/stepper'
import { FiguresCard } from '@/components/muster/ui/figures'
import { ListCard } from '@/components/muster/ui/list-card'
import { BankFileDialog } from '@/components/muster/payroll/bank-file-dialog'
import { Callout } from '@/components/muster/payroll/callout'
import { EntryBreakdown } from '@/components/muster/payroll/entry-breakdown'
import { HoldControls } from '@/components/muster/payroll/entry-controls'
import { Register } from '@/components/muster/payroll/register'
import { StageControls } from '@/components/muster/payroll/stage-controls'
import { VerifyBankButton } from '@/components/muster/payroll/verify-bank-button'
import { bankFileReady, bankFileSummary, mayExportBankFile } from '@/modules/muster/payroll/bank-file-queries'
import { loadCycleView } from '@/modules/muster/payroll/cycle-view'
import { cycleLabel, cycleMonth } from '@/modules/muster/payroll/queries'
import { readSnapshot } from '@/modules/muster/payroll/snapshot'
import { STEPS, isLocked, stepperIndex } from '@/modules/muster/payroll/stages'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Payroll month' }

type Stamp = { at?: Date | null; name?: string | null } | null | undefined
const stampText = (label: string, s: Stamp) => (s?.at ? `${label} ${formatDateTime(s.at)}${s.name ? ` by ${s.name}` : ''}` : null)

export default async function PayrollCyclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'muster', perm: 'payroll.read', feature: 'muster.payroll' })
  const view = await loadCycleView(ctx, id, { q: first(sp.q), entryId: first(sp.entry) })
  if (!view) notFound()
  const { cycle, entry } = view
  const bankFile = view.seesEveryone && mayExportBankFile(ctx) && bankFileReady(cycle.status) ? await bankFileSummary(ctx, cycle) : null
  const label = cycleLabel(cycle)
  const month = cycleMonth(cycle)
  const base = `/app/hr/payroll/${id}`
  const editable = ctx.can('payroll.run') && !isLocked(cycle.status)
  const excludedIds = new Set((cycle.holds ?? []).filter((h) => h.kind === 'exclude').map((h) => String(h.employeeId)))
  const adjustmentsBy = new Map<string, number>()
  view.adjustments.forEach((a) => adjustmentsBy.set(String(a.employeeId), (adjustmentsBy.get(String(a.employeeId)) ?? 0) + 1))
  const onHold = view.entries.filter((e) => e.status === 'on_hold').length
  const warnings = view.entries.flatMap((e) => (e.warnings ?? []).map((w) => ({ id: String(e._id), name: e.employeeName, text: w })))
  const stamps = [
    stampText('Claims closed', cycle.claimsClosed),
    stampText('Generated', cycle.generated),
    stampText('HR reviewed', cycle.hrReviewed),
    stampText('Finance approved', cycle.financeApproved),
    stampText('Locked', cycle.locked),
    stampText('Released', cycle.released),
    stampText('Payslips published', cycle.published),
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        title={`Payroll · ${label}`}
        description={cycle.paymentDate ? `Paid on ${formatDate(cycle.paymentDate)}, reference ${cycle.paymentReference}` : `${formatDate(cycle.periodStart)} – ${formatDate(cycle.periodEnd)}`}
        back={{ href: '/app/hr/payroll', label: 'Payroll' }}
        actions={
          <StageControls
            id={id}
            label={label}
            status={cycle.status}
            perms={{ run: ctx.can('payroll.run'), approve: ctx.can('payroll.approve'), lock: ctx.can('payroll.lock'), release: ctx.can('payroll.release'), unlock: ctx.can('payroll.unlock') }}
            attendanceLocked={view.attendanceLocked}
            statutoryBlocked={Boolean(view.statutory.block)}
            seesEveryone={view.seesEveryone}
            today={todayIST()}
            netLabel={formatINR(cycle.totalNet)}
          />
        }
      />
      <Card className="mb-3 rounded-[16px] px-[17px] pb-[18px] pt-4">
        <Stepper steps={STEPS} current={stepperIndex(cycle.status)} />
        {stamps.length ? <p className="mt-4 text-xs leading-relaxed text-fg-2">{stamps.join(' · ')}</p> : null}
      </Card>
      <div className="mb-3 space-y-3 empty:hidden">
        {!view.attendanceLocked && !isLocked(cycle.status) ? (
          <Callout tone="warning" title={`Lock ${label} attendance, then generate payroll`} action={<Button size="sm" variant="secondary" href={`/app/hr/attendance?view=month&month=${month}`}>Open attendance</Button>}>
            {cycle.generated?.at ? 'Attendance was reopened after this month was generated. Regenerate once the corrections are in.' : 'Payroll uses the locked month register for payable and loss-of-pay days.'}
          </Callout>
        ) : null}
        {view.statutory.block && !isLocked(cycle.status) ? <Callout tone="danger" title="Payroll is blocked" action={<Button size="sm" variant="secondary" href="/app/hr/payroll/structures?tab=statutory">Statutory rates</Button>}>{view.statutory.block}</Callout> : null}
        {view.statutory.transitions.map((t) => (
          <Callout key={String(t._id)} tone="info" title={`Rates changed on ${formatDate(t.effectiveFrom)}; payroll applies them from ${formatDate(t.payrollFrom)}`}>
            {t.note}
          </Callout>
        ))}
        {view.unscheduled && !isLocked(cycle.status) && ctx.can('claims.read') ? (
          <Callout tone="info" title={`${view.unscheduled} approved claim${view.unscheduled === 1 ? ' is' : 's are'} not in any payroll month`} action={<Button size="sm" variant="secondary" href="/app/hr/claims?tab=approved">Send to payroll</Button>}>
            Send them to {label} before it is generated (or regenerate after), so they reach net pay.
          </Callout>
        ) : null}
        {view.bankChanges.length ? (
          <Callout tone="warning" title={`${view.bankChanges.length} bank account change${view.bankChanges.length === 1 ? '' : 's'} to verify before locking`}>
            <ul className="mt-2 space-y-2">
              {view.bankChanges.map((b) => (
                <li key={String(b._id)} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {b.employeeName}: {b.previousMasked || 'none'} → <span className="text-white">{b.newMasked}</span> ({b.newIfsc}), {formatDate(b.createdAt)}
                  </span>
                  <VerifyBankButton id={String(b._id)} name={b.employeeName} account={b.newMasked ?? ''} />
                </li>
              ))}
            </ul>
          </Callout>
        ) : null}
        {cycle.skipped?.length ? (
          <Callout tone="warning" title={`${cycle.skipped.length} ${cycle.skipped.length === 1 ? 'person was' : 'people were'} skipped at the last generation`}>
            <ul className="mt-1 list-disc pl-4">
              {cycle.skipped.slice(0, 8).map((s) => (
                <li key={`${s.employeeId}`}>
                  {s.name}: {s.reason}
                  {editable && excludedIds.has(String(s.employeeId)) ? <span className="ml-2 inline-block"><HoldControls cycleId={id} employeeId={String(s.employeeId)} name={s.name ?? ''} status="excluded" /></span> : null}
                </li>
              ))}
              {cycle.skipped.length > 8 ? <li>and {cycle.skipped.length - 8} more</li> : null}
            </ul>
          </Callout>
        ) : null}
        {warnings.length ? (
          <Callout tone="warning" title={`${warnings.length} warning${warnings.length === 1 ? '' : 's'} in the register`}>
            <ul className="mt-1 space-y-0.5">
              {warnings.slice(0, 8).map((w, i) => (
                <li key={`${w.id}-${i}`}>
                  <a className="text-white transition-colors hover:text-blush" href={buildHref(base, sp, { entry: w.id })}>{w.name}</a>: {w.text}
                </li>
              ))}
              {warnings.length > 8 ? <li>and {warnings.length - 8} more</li> : null}
            </ul>
          </Callout>
        ) : null}
      </div>
      <FiguresCard
        className="mb-3"
        items={[
          { label: 'Employees', value: cycle.employeeCount, hint: onHold ? `${onHold} on hold` : view.payslips ? `${view.payslips} payslips published` : 'In this register' },
          { label: 'Gross earnings', value: formatINR(cycle.totalGross, { decimals: 0 }) },
          { label: 'Deductions', value: formatINR(cycle.totalDeductions, { decimals: 0 }) },
          { label: 'Reimbursements', value: formatINR(cycle.totalReimbursements, { decimals: 0 }) },
          { label: 'Net payable', value: formatINR(cycle.totalNet, { decimals: 0 }), hint: `Employer cost ${formatINR(cycle.totalEmployerCost, { decimals: 0 })}` },
        ]}
      />
      {entry ? (
        <div className="mb-3">
          <EntryBreakdown
            cycleId={id}
            closeHref={buildHref(base, sp, { entry: undefined })}
            editable={editable}
            snapshot={readSnapshot(entry.snapshot)}
            entry={{
              id: String(entry._id),
              employeeId: String(entry.employeeId),
              name: entry.employeeName,
              code: entry.employeeCode ?? '',
              monthlyGross: entry.monthlyGross,
              payableDays: entry.payableDays,
              workingDays: entry.workingDays,
              lopDays: entry.lopDays,
              earnedGross: entry.earnedGross,
              totalEarnings: entry.totalEarnings,
              totalDeductions: entry.totalDeductions,
              reimbursementAmount: entry.reimbursementAmount,
              netPay: entry.netPay,
              warnings: entry.warnings ?? [],
              notes: entry.notes ?? null,
              lines: entry.lines.map((l) => ({ code: l.code, label: l.label, lineType: l.lineType, amount: l.amount, isAdjustment: l.isAdjustment, reason: l.reason ?? null })),
            }}
            adjustments={view.entryAdjustments.map((a) => ({ id: String(a._id), label: a.label, lineType: a.lineType, amount: a.amount, reason: a.reason, by: a.createdByName ?? 'HR' }))}
          />
        </div>
      ) : null}
      <ListCard
        label="Salary register"
        icon={<Users />}
        description={`${view.entries.length} ${view.entries.length === 1 ? 'entry' : 'entries'} · pick a name to see the breakdown`}
        actions={
          <>
            <SearchInput placeholder="Search name or code" className="w-full sm:w-56" />
            {view.entries.length ? (
              <>
                <DownloadLink className={buttonClass('secondary', 'sm')} href={`/api/muster/reports/salary_register?month=${month}`} fallbackName={`salary_register-${month}.csv`}>
                  <Download className="size-3.5" /> Register CSV
                </DownloadLink>
                <DownloadLink className={buttonClass('secondary', 'sm')} href={`/api/muster/reports/statutory?month=${month}`} fallbackName={`statutory-${month}.csv`}>
                  Statutory CSV
                </DownloadLink>
                <DownloadLink className={buttonClass('secondary', 'sm')} href={`/api/muster/reports/journal?month=${month}`} fallbackName={`journal-${month}.csv`}>
                  Journal CSV
                </DownloadLink>
                {bankFile ? <BankFileDialog cycleId={id} label={label} summary={bankFile} /> : null}
              </>
            ) : null}
          </>
        }
      >
        <Register
          rows={view.entries.map((e) => ({
            id: String(e._id),
            employeeId: String(e.employeeId),
            name: e.employeeName,
            code: e.employeeCode ?? '',
            payableDays: e.payableDays,
            workingDays: e.workingDays,
            lopDays: e.lopDays,
            earned: e.totalEarnings,
            deductions: e.totalDeductions,
            reimbursement: e.reimbursementAmount,
            net: e.netPay,
            status: e.status,
            warnings: e.warnings?.length ?? 0,
            adjustments: adjustmentsBy.get(String(e.employeeId)) ?? 0,
          }))}
          base={base}
          sp={sp}
          cycleId={id}
          editable={editable}
          selected={entry ? String(entry._id) : undefined}
          emptyHint={!view.attendanceLocked ? `Lock ${label} attendance first, then generate.` : view.statutory.block ?? 'Generate payroll to build the register.'}
        />
      </ListCard>
    </>
  )
}
