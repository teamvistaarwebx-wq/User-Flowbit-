import type { Metadata } from 'next'
import { ChartColumn, FileSpreadsheet, Scale, Users, Wallet } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatMonth, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { BarChart } from '@/components/charts/bar-chart'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { PeriodPicker } from '@/components/folio/PeriodPicker'
import { PnlTable } from '@/components/folio/PnlTable'
import { Callout } from '@/components/folio/SetupCallout'
import { GlassCard, Note, PanelHeader, SolidCard } from '@/components/folio/ui'
import { rangeLabel, resolveBoundedPeriod, throughThisMonth } from '@/modules/folio/engine/period'
import { PAYROLL_NOTES, profitAndLoss } from '@/modules/folio/pnl/queries'
import { firmContext } from '@/modules/folio/queries/common'

export const metadata: Metadata = { title: 'Profit and loss' }

const BASE = '/app/folio/pnl'

export default async function PnlPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.reports' })
  const today = todayIST()
  const period = resolveBoundedPeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }, today, 'this_fy')
  const range = throughThisMonth(period, today)
  const { firms, firm } = await firmContext(ctx, first(sp.firm))
  const pnl = await profitAndLoss(ctx, { ...range, entityId: firm?.id ?? null })
  const span = rangeLabel(range.from, range.to)
  const salaries = pnl.rows.find((r) => r.kind === 'salaries')
  const hasData = pnl.rows.some((r) => r.total !== 0)
  const csvHref = buildHref('/api/folio/pnl/csv', {}, { firm: firm?.code, period: period.key, from: period.key === 'custom' ? period.from : undefined, to: period.key === 'custom' ? period.to : undefined })
  const short = (m: string) => formatMonth(m).slice(0, 3)

  return (
    <>
      <PageHeader
        title="Profit and loss"
        icon={<Scale />}
        description={`Billing-based · ${firm ? firm.name : 'All firms'}, ${period.noun} · ${span}`}
        actions={
          <>
            {ctx.can('expenses.read') ? <Button variant="ghost" icon={<Wallet className="size-4" />} href={buildHref('/app/folio/expenses', {}, { firm: firm?.code })}>Expenses</Button> : null}
            <a className={buttonClass('secondary')} href={csvHref}><FileSpreadsheet className="size-4" /> Export CSV</a>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <FirmSwitch base={BASE} params={sp} firms={firms} firm={firm} />
          <PeriodPicker base={BASE} params={sp} period={period} today={today} />
        </div>
      </PageHeader>

      <Callout className="mb-4" title="Billing-based: a management view, not statutory accounts">
        Income is the taxable value of invoices issued in each month less credit notes, so GST is never counted as income. Costs are expenses booked in Folio (claimable GST left out){salaries ? ' plus salaries from released Muster payroll' : ''}. It is cash-and-invoice based, with no accruals, depreciation, provisions or income tax. Your CA&rsquo;s books remain the record for filing.
      </Callout>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Net income ${period.noun}`} value={formatINRCompact(pnl.incomePaise)} hint={`${formatINR(pnl.incomePaise, { decimals: 0 })} · ${span}`} color="var(--info)" />
        <StatCard label={`Costs ${period.noun}`} value={formatINRCompact(pnl.costsPaise)} hint={salaries ? `Includes ${formatINRCompact(salaries.total)} of salaries` : 'Expenses only'} color="var(--orange)" />
        <StatCard label="Net profit" value={<span className={pnl.netPaise < 0 ? 'text-[#FF6A66]' : undefined}>{formatINRCompact(pnl.netPaise)}</span>} hint={pnl.marginPercent === null ? 'No income in this period' : `${pnl.marginPercent}% of net income`} color="var(--success)" />
        <StatCard label="Salaries" value={salaries ? formatINRCompact(salaries.total) : '—'} hint={pnl.payroll.state === 'muster_off' ? 'Muster not active' : pnl.payroll.state === 'included' ? `${pnl.payroll.releasedMonths.length} released ${pnl.payroll.releasedMonths.length === 1 ? 'month' : 'months'} from Muster` : 'Not in these numbers'} color="var(--muster)" />
      </div>

      {pnl.payroll.state !== 'included' ? (
        <Note className="mb-4" icon={<Users />}>
          {PAYROLL_NOTES[pnl.payroll.state]}
        </Note>
      ) : null}

      {hasData ? (
        <div className="space-y-4">
          <GlassCard>
            <PanelHeader icon={<ChartColumn />} title="Income against costs" subtitle={`By month, before GST · ${span}`} className="mb-5" />
            <BarChart labels={pnl.months.map(short)} series={[{ name: 'Net income', color: 'var(--info)', data: pnl.chart.map((c) => c.incomePaise) }, { name: 'Costs', color: 'var(--orange)', data: pnl.chart.map((c) => c.costsPaise) }]} formatValue={formatINRCompact} height={220} />
          </GlassCard>
          <PnlTable months={pnl.months} rows={pnl.rows} />
        </div>
      ) : (
        <SolidCard>
          <EmptyState icon={<Scale />} title={`Nothing invoiced or spent ${period.noun}`} description="Issue invoices and book expenses, and the profit and loss fills in month by month." action={ctx.can('expenses.write') ? <Button variant="secondary" href="/app/folio/expenses/new">Book an expense</Button> : undefined} />
        </SolidCard>
      )}
    </>
  )
}
