import Link from 'next/link'
import { CalendarClock, ChartColumn, Filter, Megaphone, PauseCircle, UsersRound, Wallet } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { BarChart } from '@/components/charts/bar-chart'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { TableCard, tableHead, tableRow, td, th } from '@/components/settings/surface'
import { PERIOD_LABEL, type MoneyReport, type PeriodKey } from '@/modules/console/reports/build'
import { FUNNEL_LABEL, type FunnelReport, type MarketingGroup, type MarketingRow, type TeamRow } from '@/modules/console/reports/funnel'

/** Console Reports sections (server components). Tables scroll inside their card on phones. */

const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)
const rupees = (paise: number) => formatINR(paise)
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
const whole = (v: number) => (Number.isInteger(v) ? String(v) : '')
const right = cn(td, 'text-right tabular-nums text-white')
const thRight = cn(th, 'text-right')

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr className={tableHead}>{head.map((h, i) => <th key={h} scope="col" className={i ? thRight : th}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function FunnelSection({ report, period }: { report: FunnelReport; period: PeriodKey }) {
  const signups = report.rows[0]?.count ?? 0
  const paid = report.rows.at(-1)
  return (
    <div className="grid grid-cols-12 gap-3">
      <StatCard className="col-span-6 xl:col-span-3" label="Signups" value={signups} hint={PERIOD_LABEL[period]} color="var(--info)" />
      <StatCard className="col-span-6 xl:col-span-3" label="Free · Trial" value={`${report.split.free} · ${report.split.trial}`} hint="How they started" color="var(--info)" />
      <StatCard className="col-span-6 xl:col-span-3" label="Paid" value={paid?.count ?? 0} hint={`${pct(paid?.fromSignup ?? null)} of signups`} color="var(--success)" />
      <StatCard className="col-span-6 xl:col-span-3" label="Not paying yet" value={signups - (paid?.count ?? 0)} hint="See where they stall" color="var(--warning)" />

      <Card className="col-span-12 mt-2 rounded-[14px] lg:col-span-7">
        <CardHeader label="Funnel" icon={<Filter strokeWidth={1.5} />} description="Each step counts accounts that reached it or a later one" />
        <BarChart horizontal labels={report.rows.map((r) => r.label)} series={[{ name: 'Accounts', color: 'var(--orchid)', data: report.rows.map((r) => r.count) }]} formatValue={whole} />
      </Card>
      <TableCard className="col-span-12 mt-2 lg:col-span-5" icon={<ChartColumn strokeWidth={1.5} />} label="Conversion" description="Step by step">
        <Table head={['Step', 'Accounts', 'Of previous', 'Of signups']}>
          {report.rows.map((r) => (
            <tr key={r.step} className={tableRow}>
              <td className={cn(td, 'text-white')}>{r.label}</td>
              <td className={right}>{r.count}</td>
              <td className={right}>{pct(r.fromPrevious)}</td>
              <td className={right}>{pct(r.fromSignup)}</td>
            </tr>
          ))}
        </Table>
      </TableCard>

      <TableCard className="col-span-12 mt-2 lg:col-span-5" icon={<PauseCircle strokeWidth={1.5} />} label="Where accounts stall" description="Accounts not paying, by the furthest step they reached">
        <Table head={['Stalled at', 'Accounts']}>
          {report.stalls.map((s) => (
            <tr key={s.step} className={tableRow}>
              <td className={cn(td, 'text-white')}>{s.label}<span className="block text-xs text-[#979797]">{s.hint}</span></td>
              <td className={right}>{s.count}</td>
            </tr>
          ))}
        </Table>
      </TableCard>
      <TableCard className="col-span-12 mt-2 lg:col-span-7" icon={<CalendarClock strokeWidth={1.5} />} label="Longest stalled" description="Live accounts, oldest signup first">
        {report.stalled.length ? (
          <ul className="border-t border-line py-1.5">
            {report.stalled.map((a) => (
              <li key={a.id}>
                <Link href={`/console/accounts/${a.id}`} className="flex items-center justify-between gap-3 px-[23px] py-2.5 text-sm transition-colors hover:bg-white/[0.04]">
                  <span className="min-w-0 truncate text-white">{a.name}</span>
                  <span className="shrink-0 text-[13px] text-[#979797]">{FUNNEL_LABEL[a.step]} · {a.days}d</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-line"><EmptyState compact icon={<CalendarClock />} title="Nobody is stalled." /></div>
        )}
      </TableCard>
    </div>
  )
}

export function MoneySection({ report }: { report: MoneyReport }) {
  const m = report.movement
  const month = new Date(`${report.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return (
    <div className="grid grid-cols-12 gap-3">
      <StatCard className="col-span-6 xl:col-span-3" label="MRR" value={rupees(report.mrrPaise)} hint={`ARR ${rupees(report.arrPaise)} · ex-GST`} color="var(--success)" />
      <StatCard className="col-span-6 xl:col-span-3" label="New MRR" value={rupees(m.newPaise)} hint={`${m.counts.new} accounts · ${month}`} color="var(--success)" />
      <StatCard className="col-span-6 xl:col-span-3" label="Expansion" value={rupees(m.expansionPaise)} hint={`${m.counts.expansion} up · ${rupees(m.contractionPaise)} down (${m.counts.contraction})`} color="var(--info)" />
      <StatCard className="col-span-6 xl:col-span-3" label="Churned MRR" value={rupees(m.churnedPaise)} hint={`${m.counts.churned} accounts · ${month}`} color={m.churnedPaise ? 'var(--danger)' : '#5a585b'} />
      <StatCard className="col-span-6 xl:col-span-3" label="Renewals in 30 days" value={rupees(report.renewals.paise)} hint={`${report.renewals.rows.length} plans · ex-GST`} color="var(--info)" />
      <StatCard className="col-span-6 xl:col-span-3" label="Overdue" value={rupees(report.overdueBills.paise)} hint={`${report.overdueBills.count} bills · ${report.pastDue.count} plans past renewal`} color={report.overdueBills.count || report.pastDue.count ? 'var(--danger)' : '#5a585b'} />
      <StatCard className="col-span-6 xl:col-span-3" label="TDS pending" value={rupees(report.tds.paise)} hint={`${report.tds.count} certificates awaited`} color={report.tds.count ? 'var(--warning)' : '#5a585b'} />
      <StatCard className="col-span-6 xl:col-span-3" label="Message margin" value={rupees(report.wallet.at(-1)?.marginPaise ?? 0)} hint={`${month} · wallet`} color="var(--info)" />

      <Card className="col-span-12 mt-2 rounded-[14px]">
        <CardHeader label="Collections by month" icon={<ChartColumn strokeWidth={1.5} />} description="Money received, GST included. Test payments are left out." />
        <BarChart stacked labels={report.collections.map((c) => monthLabel(c.month))} series={[{ name: 'Plans', color: 'var(--orchid)', data: report.collections.map((c) => c.planPaise / 100) }, { name: 'Wallet recharges', color: 'var(--info)', data: report.collections.map((c) => c.walletPaise / 100) }]} height={220} formatValue={(v) => formatINR(v * 100)} />
      </Card>

      <TableCard className="col-span-12 mt-2 lg:col-span-7" icon={<Wallet strokeWidth={1.5} />} label="WhatsApp wallet" description="Credit bought (ex-GST) and the margin on messages: paid credit used, less the provider's cost in Flowbit-managed mode">
        <Table head={['Month', 'Recharged', 'Revenue', 'Cost', 'Margin', 'Messages']}>
          {[...report.wallet].reverse().map((w) => (
            <tr key={w.month} className={tableRow}>
              <td className={cn(td, 'text-white')}>{monthLabel(w.month)} {w.month.slice(0, 4)}</td>
              <td className={right}>{rupees(w.rechargePaise)}</td>
              <td className={right}>{rupees(w.revenuePaise)}</td>
              <td className={right}>{rupees(w.costPaise)}</td>
              <td className={right}>{rupees(w.marginPaise)}</td>
              <td className={right}>{w.messages}</td>
            </tr>
          ))}
        </Table>
      </TableCard>
      <TableCard className="col-span-12 mt-2 lg:col-span-5" icon={<CalendarClock strokeWidth={1.5} />} label="Renewals due in 30 days" description="Autopay plans collect themselves; the rest need a bill">
        {report.renewals.rows.length ? (
          <ul className="border-t border-line py-1.5">
            {report.renewals.rows.map((r) => (
              <li key={r.id}>
                <Link href={`/console/accounts/${r.id}`} className="flex items-center justify-between gap-3 px-[23px] py-2.5 text-sm transition-colors hover:bg-white/[0.04]">
                  <span className="min-w-0"><span className="block truncate text-white">{r.name}</span><span className="block text-xs text-[#979797]">{r.periodEnd ? formatDate(r.periodEnd) : ''} · {r.cycle ?? ''}{r.autopay ? ' · autopay' : ''}</span></span>
                  <span className="shrink-0 tabular-nums text-white">{rupees(r.amountPaise)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-line"><EmptyState compact icon={<CalendarClock />} title="No renewals in the next 30 days." /></div>
        )}
      </TableCard>
    </div>
  )
}

export function TeamSection({ rows, period, own }: { rows: TeamRow[]; period: PeriodKey; own: boolean }) {
  return (
    <TableCard icon={<UsersRound strokeWidth={1.5} />} label={own ? 'Your numbers' : 'Numbers per salesperson'} description={`Accounts held now; signups and first payments in the last ${PERIOD_LABEL[period]}`}>
      {rows.length ? (
        <Table head={['Salesperson', 'Accounts', 'Free', 'Trial', 'Paid', 'Habit', 'Signups', 'Paid first', 'Conversion', 'MRR']}>
          {rows.map((r) => (
            <tr key={r.staffId ?? 'none'} className={tableRow}>
              <td className={cn(td, 'whitespace-nowrap text-white')}>{r.name}</td>
              <td className={right}>{r.accounts}</td>
              <td className={right}>{r.free}</td>
              <td className={right}>{r.trial}</td>
              <td className={right}>{r.paid}</td>
              <td className={right}>{r.habit}</td>
              <td className={right}>{r.signups}</td>
              <td className={right}>{r.conversions}</td>
              <td className={right}>{pct(r.conversionRate)}</td>
              <td className={right}>{rupees(r.mrrPaise)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="border-t border-line"><EmptyState compact icon={<UsersRound />} title="No accounts assigned yet." /></div>
      )}
    </TableCard>
  )
}

export function MarketingSection({ rows, group, period }: { rows: MarketingRow[]; group: MarketingGroup; period: PeriodKey }) {
  return (
    <TableCard icon={<Megaphone strokeWidth={1.5} />} label={`Signups by UTM ${group}`} description={`First touch, signups in the last ${PERIOD_LABEL[period]}. No tag and no outside referrer = Direct.`}>
      {rows.length ? (
        <Table head={[`UTM ${group}`, 'Signups', 'Free', 'Trial', 'Paid', 'Conversion', 'MRR']}>
          {rows.map((r) => (
            <tr key={r.key} className={tableRow}>
              <td className={cn(td, 'text-white')}>{r.key}</td>
              <td className={right}>{r.signups}</td>
              <td className={right}>{r.free}</td>
              <td className={right}>{r.trial}</td>
              <td className={right}>{r.paid}</td>
              <td className={right}>{pct(r.conversionRate)}</td>
              <td className={right}>{rupees(r.mrrPaise)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="border-t border-line"><EmptyState compact icon={<Megaphone />} title="No signups in this period." /></div>
      )}
    </TableCard>
  )
}
