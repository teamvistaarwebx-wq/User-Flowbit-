import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarRange, Layers, ShieldCheck } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, monthOf, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { Callout } from '@/components/muster/payroll/callout'
import { Figures } from '@/components/muster/ui/figures'
import { ListCard, TABLE } from '@/components/muster/ui/list-card'
import { OpenMonthDialog } from '@/components/muster/payroll/open-month-dialog'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { StatutoryVersion } from '@/models/muster/StatutoryVersion'
import { cycleLabel, syncAttendanceStages } from '@/modules/muster/payroll/queries'
import { STAGE_LABELS, STAGE_TONES, stageIndex } from '@/modules/muster/payroll/stages'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Payroll' }
const BASE = '/app/hr/payroll'
/** The eight SPEC gates between an open month and published payslips. */
const GATES = 8

type CycleStamps = { generated?: { at?: Date | null } | null; released?: { at?: Date | null } | null; locked?: { at?: Date | null } | null; paymentDate?: string | null }

/** "Generated 3 Oct · paid 7 Oct": the latest step with a date. */
function stampLine(c: CycleStamps): string {
  const parts = [c.generated?.at ? `Generated ${formatDate(c.generated.at)}` : 'Not generated yet']
  if (c.released?.at) parts.push(`paid ${c.paymentDate ? formatDate(c.paymentDate) : formatDate(c.released.at)}`)
  else if (c.locked?.at) parts.push(`locked ${formatDate(c.locked.at)}`)
  return parts.join(' · ')
}

export default async function PayrollPage() {
  const ctx = await requireMember({ product: 'muster', perm: 'payroll.read', feature: 'muster.payroll' })
  const [cycles, proposals, unverified] = await Promise.all([
    ctx.db(PayrollCycle).find({}).sort({ year: -1, month: -1 }).lean().then((rows) => syncAttendanceStages(ctx, rows)),
    ctx.db(StatutoryVersion).countDocuments({ confirmedAt: null }),
    ctx.can('people.read_sensitive') ? ctx.db(BankChangeRequest).countDocuments({ verifiedAt: null }) : Promise.resolve(0),
  ])
  const latest = cycles[0] ?? null

  return (
    <>
      <PageHeader
        title="Payroll"
        help="month-lock"
        description="Each month moves through eight gates, from locked attendance to published payslips."
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          <>
            <Button variant="secondary" icon={<Layers className="size-4" />} href={`${BASE}/structures`}>
              Salary structures
            </Button>
            {ctx.can('payroll.run') ? <OpenMonthDialog defaultMonth={monthOf(todayIST())} /> : null}
          </>
        }
      />
      <div className="flex flex-col gap-3">
        {proposals ? (
          <Callout tone="warning" title={`${proposals} set${proposals === 1 ? '' : 's'} of statutory rates awaiting confirmation`} action={<Button size="sm" variant="secondary" href={`${BASE}/structures?tab=statutory`}>Review rates</Button>}>
            Payroll for a month covered by unconfirmed rates cannot be generated.
          </Callout>
        ) : null}
        {unverified ? (
          <Callout tone="warning" title={`${unverified} bank account change${unverified === 1 ? '' : 's'} not verified yet`}>
            Open a payroll month to verify them before salaries are released.
          </Callout>
        ) : null}
        {latest ? (
          // The newest month as the dashboard's workday timeline: one glass card around a thick 42px bar.
          <Link href={`${BASE}/${latest._id}`} className="glass lift block rounded-[16px] px-[17px] pb-[18px] pt-4 animate-fade-in">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="flex items-center gap-2.5">
                <span className="text-sm font-semibold uppercase tracking-[0.04em] text-white">{cycleLabel(latest)}</span>
                <Badge tone={STAGE_TONES[latest.status]}>{STAGE_LABELS[latest.status]}</Badge>
              </span>
              <span className="text-[13px] text-white/70">{stampLine(latest)}</span>
            </div>
            <Progress size="lg" value={(stageIndex(latest.status) / GATES) * 100} label={`Gate ${stageIndex(latest.status)} of ${GATES}`} />
            <Figures
              className="mt-4"
              items={[
                { label: 'Employees', value: latest.employeeCount },
                { label: 'Gross', value: formatINR(latest.totalGross, { decimals: 0 }) },
                { label: 'Deductions', value: formatINR(latest.totalDeductions, { decimals: 0 }) },
                { label: 'Net payable', value: formatINR(latest.totalNet, { decimals: 0 }) },
              ]}
            />
          </Link>
        ) : null}
        <ListCard label="Payroll months" icon={<CalendarRange />} description={cycles.length ? `${cycles.length} ${cycles.length === 1 ? 'month' : 'months'}, newest first` : 'Nothing opened yet'}>
          {cycles.length === 0 ? (
            <EmptyState compact icon={<CalendarRange />} title="No payroll months yet" description="Open the first month once attendance for it has been locked." action={ctx.can('payroll.run') ? <OpenMonthDialog defaultMonth={monthOf(todayIST())} /> : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className={TABLE.table}>
                <thead>
                  <tr className={TABLE.headRow}>
                    <th className={TABLE.th}>Month</th>
                    <th className={TABLE.th}>Stage</th>
                    <th className={cn(TABLE.th, 'hidden md:table-cell')}>Last step</th>
                    <th className={cn(TABLE.th, 'text-right')}>Employees</th>
                    <th className={cn(TABLE.th, 'hidden text-right lg:table-cell')}>Gross</th>
                    <th className={cn(TABLE.th, 'hidden text-right lg:table-cell')}>Deductions</th>
                    <th className={cn(TABLE.th, 'hidden text-right xl:table-cell')}>Claims</th>
                    <th className={cn(TABLE.th, 'text-right')}>Net payable</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={String(c._id)} className={cn(TABLE.row, 'relative')}>
                      <td className={TABLE.td}>
                        <Link href={`${BASE}/${c._id}`} className="whitespace-nowrap text-white after:absolute after:inset-0 after:content-['']">
                          {cycleLabel(c)}
                        </Link>
                      </td>
                      <td className={TABLE.td}>
                        <Badge tone={STAGE_TONES[c.status]}>{STAGE_LABELS[c.status]}</Badge>
                      </td>
                      <td className={cn(TABLE.td, 'hidden text-[#979797] md:table-cell')}>{stampLine(c)}</td>
                      <td className={cn(TABLE.td, 'text-right tabular-nums')}>{c.employeeCount}</td>
                      <td className={cn(TABLE.td, 'hidden text-right tabular-nums lg:table-cell')}>{formatINR(c.totalGross, { decimals: 0 })}</td>
                      <td className={cn(TABLE.td, 'hidden text-right tabular-nums lg:table-cell')}>{formatINR(c.totalDeductions, { decimals: 0 })}</td>
                      <td className={cn(TABLE.td, 'hidden text-right tabular-nums xl:table-cell')}>{formatINR(c.totalReimbursements, { decimals: 0 })}</td>
                      <td className={cn(TABLE.td, 'text-right font-semibold tabular-nums text-white')}>{formatINR(c.totalNet, { decimals: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ListCard>
        {ctx.can('people.read_sensitive') && !unverified ? (
          <p className="flex items-center gap-2 pt-1 text-xs text-fg-2">
            <ShieldCheck className="size-3.5 text-icon-muted" /> Every bank account change has been verified.
          </p>
        ) : null}
      </div>
    </>
  )
}
