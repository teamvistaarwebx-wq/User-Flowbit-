import type { Metadata } from 'next'
import { CalendarClock, ListChecks } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { StatusPill } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { LinkTabs } from '@/components/ui/tabs'
import { FiguresCard } from '@/components/muster/ui/figures'
import { SegmentLinks } from '@/components/muster/ui/filter-chips'
import { LIST_FLUSH, ListCard } from '@/components/muster/ui/list-card'
import { CompOffDialog } from '@/components/muster/leave/compoff-dialog'
import { DecideButtons } from '@/components/muster/leave/decide-buttons'
import { decideAttendanceCorrection } from '@/modules/muster/attendance/correction-actions'
import { CELL_META, type CellStatus } from '@/modules/muster/attendance/register'
import { compOffInHand, listCompOffs, listCorrections, REQUEST_TABS, type RequestRow, type RequestTab } from '@/modules/muster/attendance/requests'
import { decideCompOff } from '@/modules/muster/leave/compoff-actions'
import { applicableEmployees } from '@/modules/muster/leave/queries'
import { getPolicy } from '@/modules/muster/settings/queries'

export const metadata: Metadata = { title: 'Corrections' }

const BASE = '/app/hr/attendance/corrections'
const label = (s: string) => CELL_META[s as CellStatus]?.label ?? s

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'attendance.approve' })
  const kind = first(sp.tab) === 'compoff' ? 'compoff' : 'corrections'
  const status: RequestTab = (REQUEST_TABS as readonly string[]).includes(first(sp.status) ?? '') ? (first(sp.status) as RequestTab) : 'pending'
  const [rows, inHand, policy, people] = await Promise.all([
    kind === 'compoff' ? listCompOffs(ctx, status) : listCorrections(ctx, status, label),
    compOffInHand(ctx),
    getPolicy(ctx),
    ctx.can('people.write') ? applicableEmployees(ctx) : Promise.resolve([]),
  ])
  const waiting = rows.filter((r) => r.decidable).length
  const own = ctx.member.employeeId ? String(ctx.member.employeeId) : null
  const raiseFor = people.length ? people : own ? [{ value: own, label: 'Me' }] : []
  const valid = policy.attendance.compOffValidDays
  const action = kind === 'compoff' ? decideCompOff : decideAttendanceCorrection

  const columns: Column<RequestRow>[] = [
    { key: 'employee', header: 'Employee', cell: (r) => <span className="text-white">{r.employee}</span> },
    { key: 'what', header: kind === 'compoff' ? 'Worth' : 'Change', cell: (r) => <span className="text-fg">{r.what}</span> },
    { key: 'date', header: kind === 'compoff' ? 'Day worked' : 'Day', cell: (r) => formatDate(r.date, { withWeekday: true }) },
    { key: 'reason', header: 'Reason', hideOnMobile: true, cell: (r) => <span className="line-clamp-2 max-w-xs">{r.reason || '—'}</span> },
    { key: 'where', header: 'Where it sits', hideOnMobile: true, cell: (r) => <span className="text-xs text-fg-2">{r.where}{r.signedBy.length ? <span className="block">Signed: {r.signedBy.join(', ')}</span> : null}{r.extra ? <span className="block">{r.extra}</span> : null}</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill status={r.status} /> },
    { key: 'decide', header: '', align: 'right', cell: (r) => (r.decidable ? <DecideButtons action={action} id={r.id} subject={kind === 'compoff' ? `${r.employee}'s comp-off` : `${r.employee}'s correction`} /> : null) },
  ]

  return (
    <>
      <PageHeader
        title="Corrections and comp-off"
        description="Days employees asked to fix, and days off they worked. Managers sign first, then HR."
        breadcrumb={breadcrumbFor(BASE)}
        back={{ href: '/app/hr/attendance', label: 'Attendance register' }}
        actions={raiseFor.length ? <CompOffDialog employees={raiseFor} today={todayIST()} hint={valid ? `It lapses ${valid} days after the day worked.` : 'It does not lapse.'} /> : null}
      >
        <LinkTabs tabs={[{ href: BASE, label: 'Corrections' }, { href: `${BASE}?tab=compoff`, label: 'Comp-off' }]} />
      </PageHeader>
      <FiguresCard
        className="mb-3"
        items={[
          { label: 'Waiting on you', value: waiting, tone: waiting ? 'warning' : undefined, hint: waiting ? undefined : 'You are all caught up' },
          { label: 'Comp-off in hand', value: inHand, hint: valid ? `Lapses after ${valid} days` : 'Does not lapse' },
        ]}
      />
      <ListCard
        label={kind === 'compoff' ? 'Comp-off' : 'Corrections'}
        icon={kind === 'compoff' ? <CalendarClock /> : <ListChecks />}
        description={`${rows.length} ${rows.length === 1 ? 'request' : 'requests'} ${status === 'pending' ? 'awaiting a decision' : status === 'approved' ? 'approved' : 'in total'}`}
        actions={<SegmentLinks label="Status" items={REQUEST_TABS.map((s) => ({ key: s, href: buildHref(BASE, sp, { status: s === 'pending' ? undefined : s }), label: s === 'pending' ? 'Awaiting decision' : s === 'approved' ? 'Approved' : 'All', active: status === s }))} />}
      >
        <DataTable
          className={LIST_FLUSH}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState compact icon={<ListChecks />} title={status === 'pending' ? 'Nothing is waiting for a decision' : 'Nothing here yet'} description={kind === 'compoff' ? 'Comp-offs claimed for worked weekly offs and holidays appear here.' : 'Employees ask for corrections from My attendance.'} />}
        />
      </ListCard>
    </>
  )
}
