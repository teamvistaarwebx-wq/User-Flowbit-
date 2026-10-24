import type { Metadata } from 'next'
import Link from 'next/link'
import { AlarmClock, ChartColumn, MessageSquareText, PhoneCall, Receipt } from 'lucide-react'
import { requireStaff } from '@/lib/console/session'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { BarChart } from '@/components/charts/bar-chart'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { AlertsCard } from '@/components/console/alerts-card'
import { DemoStatusSelect } from '@/components/console/demo-status-select'
import { HealthDot } from '@/components/console/health-dot'
import { TableCard, tableHead, tableRow, td, th } from '@/components/settings/surface'
import { StaffAlert } from '@/models/console/StaffAlert'
import { consoleOverview, type CallTodayRow } from '@/modules/console/accounts-query'
import { recentDemoRequests, type DemoRequestRow } from '@/modules/console/demo-requests'

export const metadata: Metadata = { title: 'Home' }

/** Problem counts glow only when there is a problem; at zero the card stays neutral instead of crying wolf. */
const QUIET = '#5a585b'
/** Signups are whole workspaces: no "0.5" gridline label. */
const wholeOnly = (v: number) => (Number.isInteger(v) ? String(v) : '')
const reasonLabel = (reason: CallTodayRow['reason'], redSeats: number): string => (reason === 'red_big' ? `Red, more than ${redSeats} people` : 'Free ends soon')

export default async function ConsoleHomePage() {
  const p = await requireStaff('accounts.view')
  const [data, demos, alerts] = await Promise.all([
    consoleOverview(p),
    recentDemoRequests(p),
    p.raw(StaffAlert).find({ readAt: null, $or: [{ staffId: p.staff.id }, { staffId: null }] }).sort({ createdAt: -1 }).limit(20).lean(),
  ])
  const k = data.kpis
  return (
    <>
      <PageHeader title="Console" description={`${data.total} ${data.total === 1 ? 'workspace' : 'workspaces'} on Flowbit.${data.excluded ? ` ${data.excluded} internal or test ${data.excluded === 1 ? 'workspace is' : 'workspaces are'} left out of these numbers.` : ''}`} />
      <div className="grid grid-cols-12 gap-3">
        <StatCard className="col-span-6 xl:col-span-3" label="Signups this week" value={k.signupsThisWeek} color="var(--info)" href="/console/accounts?order=created" />
        <StatCard className="col-span-6 xl:col-span-3" label="Free · Trial · Paid" value={`${k.free} · ${k.trial} · ${k.paid}`} hint={`MRR ${formatINR(k.mrr)} ex-GST`} color="var(--success)" href="/console/accounts" />
        <StatCard className="col-span-6 xl:col-span-3" label="In setup" value={k.inSetup} color="var(--info)" href="/console/setup" />
        <StatCard className="col-span-6 xl:col-span-3" label="Habit formed" value={k.habitFormed} hint="Green health score" color="var(--success)" href="/console/accounts?health=green" />
        <StatCard className="col-span-6 xl:col-span-3" label="Conversions" value={k.conversionsThisMonth} hint="First payment this month" color="var(--success)" />
        <StatCard className="col-span-6 xl:col-span-3" label="Free ending in 30 days" value={k.freeEnding30} color={k.freeEnding30 ? 'var(--warning)' : QUIET} href="/console/accounts?type=free&days=30&order=days" />
        <StatCard className="col-span-6 xl:col-span-3" label="Overdue" value={formatINR(k.overduePaise)} hint={`${k.overdueBills} ${k.overdueBills === 1 ? 'bill' : 'bills'} past the due date · ${k.pastDue} ${k.pastDue === 1 ? 'account' : 'accounts'} past due`} color={k.overdueBills || k.pastDue ? 'var(--danger)' : QUIET} href={p.can('billing.view') ? '/console/billing?tab=overdue' : '/console/accounts?state=past_due'} />
        <StatCard className="col-span-6 xl:col-span-3" label="Call today" value={data.callToday.length} color={data.callToday.length ? 'var(--warning)' : QUIET} />

        <TableCard className="col-span-12 mt-2 lg:col-span-7" icon={<PhoneCall strokeWidth={1.5} />} label="Call today" description="Red accounts with more than 5 people, and Free accounts in their last 30 days">
          {data.callToday.length ? (
            <ul className="border-t border-line py-1.5">
              {data.callToday.slice(0, 15).map((r) => (
                <li key={r.id}>
                  <Link href={`/console/accounts/${r.id}`} className="flex items-center justify-between gap-3 px-[23px] py-2.5 transition-colors hover:bg-white/[0.04]">
                    <span className="flex min-w-0 items-center gap-2">
                      <HealthDot score={r.health} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{r.name}</span>
                        <span className="block truncate text-xs text-[#979797]">{r.owner?.email ?? 'No owner'} · {r.seatsUsed} people · {r.salesperson?.name ?? 'Unassigned'}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-medium text-warning">{reasonLabel(r.reason, data.callRedSeats)}{r.daysLeft != null ? ` · ${r.daysLeft}d` : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-line"><EmptyState compact icon={<PhoneCall />} title="Nobody to call today" /></div>
          )}
        </TableCard>
        <div className="col-span-12 mt-2 lg:col-span-5">
          <AlertsCard rows={alerts.map((a) => ({ id: String(a._id), orgId: String(a.orgId), title: a.title, at: a.createdAt.toISOString(), mine: String(a.staffId ?? '') === String(p.staff.id) }))} />
        </div>

        <Card className="col-span-12 mt-2 rounded-[14px] lg:col-span-7">
          <CardHeader label="Signups per week" icon={<ChartColumn strokeWidth={1.5} />} description="Last 12 weeks" />
          <BarChart labels={data.signups.map((w) => w.label)} series={[{ name: 'Workspaces', color: 'var(--orchid)', data: data.signups.map((w) => w.count) }]} height={220} formatValue={wholeOnly} />
        </Card>
        <Card variant="solid" className="col-span-12 mt-2 lg:col-span-5">
          <CardHeader label="Free ending soon" icon={<AlarmClock strokeWidth={1.5} />} description="Free workspaces in their last 30 days" />
          {data.freeEnding.length ? (
            <ul className="-mx-5 border-t border-line">
              {data.freeEnding.map((r) => (
                <li key={r.id}>
                  <Link href={`/console/accounts/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.04]">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">{r.name}</span>
                      <span className="block truncate text-xs text-[#979797]">{r.owner?.email ?? 'No owner'} · {r.seatsUsed} people</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-medium text-warning">{r.daysLeft} days left</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<AlarmClock />} title="No Free plan ends this month" />
          )}
        </Card>
        <TableCard className="col-span-12" icon={<Receipt strokeWidth={1.5} />} label="Recent payments" description="Flowbit invoices across every workspace">
          {data.recent.length ? (
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className={tableHead}>
                    <th scope="col" className={th}>Number</th>
                    <th scope="col" className={th}>Workspace</th>
                    <th scope="col" className={cn(th, 'text-right')}>Amount</th>
                    <th scope="col" className={th}>Date</th>
                    <th scope="col" className={th}>Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((i) => (
                    <tr key={i.id} className={tableRow}>
                      <td className={cn(td, 'text-white')}><a href={`/api/subscription/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer" className="hover:underline">{i.number}</a></td>
                      <td className={cn(td, 'text-white')}><Link href={`/console/accounts/${i.orgId}`} className="hover:text-blush">{i.org}</Link></td>
                      <td className={cn(td, 'text-right tabular-nums text-white')}>{formatINR(i.totalPaise, { decimals: 2 })}</td>
                      <td className={cn(td, 'whitespace-nowrap text-[#979797]')}>{formatDate(i.date)}</td>
                      <td className={cn(td, i.provider === 'razorpay' ? 'text-[#2DCBAF]' : 'text-[#979797]')}>{i.provider === 'simulated' ? 'Test' : i.provider === 'razorpay' ? 'Razorpay' : i.provider}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line"><EmptyState compact icon={<Receipt />} title="No payments yet" /></div>
          )}
        </TableCard>
      </div>
      <DemoRequests rows={demos.rows} open={demos.open} />
    </>
  )
}

/** Demo requests from the public /contact page, newest first, with a status picker. */
function DemoRequests({ rows, open }: { rows: DemoRequestRow[]; open: number }) {
  return (
    <TableCard className="mt-5" icon={<MessageSquareText strokeWidth={1.5} />} label="Demo requests" description={open ? `${open} new from the contact page` : 'Nothing new from the contact page'}>
      {rows.length ? (
        <ul className="border-t border-line py-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 px-[23px] py-3 text-sm transition-colors hover:bg-white/[0.03]">
              <div className="min-w-0 flex-1">
                <p className="text-white">{r.name} <span className="text-[#979797]">·</span> {r.company}</p>
                <p className="text-xs text-[#979797]">
                  <a href={`mailto:${r.email}`} className="hover:text-white">{r.email}</a>
                  {r.phone ? ` · ${r.phone}` : ''} · {r.teamSize} people{r.products.length ? ` · ${r.products.join(', ')}` : ''} · {formatDateTime(r.createdAt)}
                </p>
                <p className="mt-1 line-clamp-2 text-[13px] text-white/80">{r.message}</p>
              </div>
              <DemoStatusSelect id={r.id} status={r.status} company={r.company} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-t border-line"><EmptyState compact icon={<MessageSquareText />} title="No demo requests yet" description="Requests from the contact page appear here." /></div>
      )}
    </TableCard>
  )
}
